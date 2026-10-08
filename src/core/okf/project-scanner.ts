import fs from 'fs';
import path from 'path';
import { db } from '../basevault/db';
import { OKFDirectoryManager } from './directory-manager';

// Directories to skip (common non-documentation paths)
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.gitnexus', '.neurosync', '.nexus_worktrees',
  'dist', 'build', '.next', '.cache', '__pycache__', '.venv', 'venv',
  'vendor', 'target', '.data', '.understand-anything', '.antigravity',
  'coverage', '.nyc_output', '.turbo', '.parcel-cache',
]);

// Documentation file extensions to discover
const DOC_EXTENSIONS = new Set(['.md', '.txt', '.rst', '.adoc', '.mdx']);

export interface DiscoveredDoc {
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
  isProcessed: boolean;
  sizeKB: string;
}

export type ScanProjectResult =
  | {
      success: true;
      projectId: string;
      rootPath: string;
      totalFound: number;
      unprocessedCount: number;
      processedCount: number;
      unprocessed: DiscoveredDoc[];
      processed: DiscoveredDoc[];
      okfNodesExisting: number;
    }
  | { success: false; error: string; httpStatus: 400 | 500 };

/**
 * Discover documentation files in a project's directory tree and report which
 * ones have already been converted into OKF concepts.
 *
 * Extracted from the POST /api/okf/scan-project route handler so it can be
 * called in-process from other trigger points (e.g. an auto-scan when a
 * PortGrid terminal session for the project closes) without a self-HTTP-call.
 */
export function scanProjectForDocs(projectId: string): ScanProjectResult {
  const project = db.prepare('SELECT project_root_path FROM projects WHERE id = ?').get(projectId) as
    | { project_root_path: string | null }
    | undefined;
  if (!project?.project_root_path) {
    return { success: false, error: 'Project has no project_root_path configured.', httpStatus: 400 };
  }

  const rootPath = project.project_root_path;

  const discoveredDocs: { relativePath: string; absolutePath: string; extension: string; sizeBytes: number }[] = [];

  const walk = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue; // skip dotfiles
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (DOC_EXTENSIONS.has(ext)) {
            try {
              const stat = fs.statSync(fullPath);
              discoveredDocs.push({
                relativePath: path.relative(rootPath, fullPath),
                absolutePath: fullPath,
                extension: ext,
                sizeBytes: stat.size,
              });
            } catch {
              /* unreadable file, skip */
            }
          }
        }
      }
    } catch {
      /* unreadable directory, skip */
    }
  };

  walk(rootPath);

  const okfDir = path.join(rootPath, '.neurosync', 'project_okf');
  const existingOKFFiles = fs.existsSync(okfDir)
    ? new Set(OKFDirectoryManager.listMarkdownFiles(okfDir).map((f) => path.relative(okfDir, f)))
    : new Set<string>();

  const processedRow = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(`okf_processed_docs_${projectId}`) as
    | { value: string }
    | undefined;
  const processedSet = new Set<string>(processedRow ? JSON.parse(processedRow.value) : []);

  const results: DiscoveredDoc[] = discoveredDocs.map((doc) => ({
    ...doc,
    isProcessed: processedSet.has(doc.relativePath),
    sizeKB: (doc.sizeBytes / 1024).toFixed(1),
  }));

  const unprocessed = results.filter((d) => !d.isProcessed);
  const processed = results.filter((d) => d.isProcessed);

  return {
    success: true,
    projectId,
    rootPath,
    totalFound: results.length,
    unprocessedCount: unprocessed.length,
    processedCount: processed.length,
    unprocessed,
    processed,
    okfNodesExisting: existingOKFFiles.size,
  };
}

/**
 * Compute a cheap change-detection fingerprint of a project's documentation
 * files, WITHOUT the full `scanProjectForDocs()` cost (no DB reads of the
 * processed-set, no OKF-directory listing, no per-doc `DiscoveredDoc` objects).
 *
 * Used by the terminal auto-scan cooldown to decide whether anything actually
 * changed since the last scan. The old cooldown was purely time-based, so two
 * terminal sessions for the same project closing inside the 60s window meant the
 * second close was skipped even if a coding agent had just written new files in
 * between — its real changes were silently missed. Comparing this signal lets a
 * changed project force a re-scan even inside the cooldown window.
 *
 * The signal folds together three things across every discovered doc file:
 *   • count       — moves whenever a doc file is added or deleted,
 *   • newest mtime — moves whenever any doc file is edited in place,
 *   • total bytes  — moves on most in-place edits too (belt-and-suspenders,
 *                    catches size changes even on filesystems with coarse mtime).
 * It uses the exact same SKIP_DIRS / DOC_EXTENSIONS walk rules as the real scan
 * so "changed" here means the same set of files the scan would actually report.
 *
 * Returns null when the project has no configured root path (nothing to
 * fingerprint) — callers treat null as "can't tell, don't rely on it to skip".
 */
export function computeProjectDocSignal(projectId: string): string | null {
  const project = db.prepare('SELECT project_root_path FROM projects WHERE id = ?').get(projectId) as
    | { project_root_path: string | null }
    | undefined;
  if (!project?.project_root_path) return null;

  const rootPath = project.project_root_path;
  let count = 0;
  let newestMtimeMs = 0;
  let totalBytes = 0;

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir, skip (mirrors scanProjectForDocs)
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue; // skip dotfiles
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!DOC_EXTENSIONS.has(ext)) continue;
        try {
          const stat = fs.statSync(fullPath);
          count += 1;
          totalBytes += stat.size;
          if (stat.mtimeMs > newestMtimeMs) newestMtimeMs = stat.mtimeMs;
        } catch {
          /* unreadable file, skip */
        }
      }
    }
  };

  walk(rootPath);
  return `${count}:${newestMtimeMs}:${totalBytes}`;
}

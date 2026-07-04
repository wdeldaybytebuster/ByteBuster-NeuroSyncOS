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

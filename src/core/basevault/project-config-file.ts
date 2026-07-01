import path from 'path';
import fs from 'fs';
import { parse, stringify } from 'yaml';

const NEUROSYNC_DIR = '.neurosync';
const CONFIG_FILE = 'neurosync-config.yaml';

export interface ProjectConfigFile {
  id: string;
  name: string;
  created_at: string; // ISO string — this file is meant to be human-read/edited
  version: 1;
}

export interface ProjectConfigFileRead {
  id?: string;
  name?: string;
  created_at?: string;
}

/**
 * Writes a human-readable, hand-editable config file into the project's own
 * .neurosync/ folder, alongside the project_okf/ and scout_drafts/ dirs
 * OKFDirectoryManager already manages. This is the Tier-1 portability file —
 * copying the project folder to another machine should carry its identity
 * with it, not leave it trapped in this machine's SQLite database.
 *
 * Best-effort only: a project with no project_root_path has nowhere
 * meaningful to put a portable file (skipped, non-fatal). A filesystem
 * failure (permissions, disk full) is logged and swallowed — it must never
 * fail the caller's own database write.
 */
export function writeProjectConfigYaml(project: {
  id: string;
  name: string;
  project_root_path: string | null | undefined;
  created_at: number;
}): void {
  if (!project.project_root_path) return;

  try {
    const dir = path.join(project.project_root_path, NEUROSYNC_DIR);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const content: ProjectConfigFile = {
      id: project.id,
      name: project.name,
      created_at: new Date(project.created_at).toISOString(),
      version: 1,
    };

    fs.writeFileSync(path.join(dir, CONFIG_FILE), stringify(content));
  } catch (err: any) {
    console.warn(`[ProjectConfigFile] Failed to write ${CONFIG_FILE} for project ${project.id}:`, err.message);
  }
}

/**
 * Reads and parses an existing neurosync-config.yaml, if present — the read
 * side of portability: a project folder copied from another machine already
 * has this file, and its `name` (and `id`, see routes/projects.ts's POST
 * handler for how id-reuse is decided) should be honored on import rather
 * than silently discarded.
 *
 * Returns null on any missing/unreadable/unparseable file — never throws.
 */
export function readProjectConfigYaml(projectRootPath: string): ProjectConfigFileRead | null {
  try {
    const filePath = path.join(projectRootPath, NEUROSYNC_DIR, CONFIG_FILE);
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      id: typeof parsed.id === 'string' ? parsed.id : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      created_at: typeof parsed.created_at === 'string' ? parsed.created_at : undefined,
    };
  } catch {
    return null;
  }
}

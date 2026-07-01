import path from 'path';
import fs from 'fs';
import os from 'os';
import { db } from '../basevault/db';

/**
 * Manages the OKF 3-Tier directory structure.
 * 
 * Resolution hierarchy: PROJECT > USER > GLOBAL (most specific wins)
 * 
 * GLOBAL:  ~/.neurosync/global_okf/     (system-wide, read-only for agents)
 * USER:    ~/.neurosync/user_okf/        (operator habits, cross-project)
 * PROJECT: <project_root>/.neurosync/project_okf/  (strictly siloed)
 * SCOUT:   <project_root>/.neurosync/scout_drafts/ (quarantine)
 */
export class OKFDirectoryManager {
  private static readonly NEUROSYNC_DIR = '.neurosync';
  private static readonly GLOBAL_OKF = 'global_okf';
  private static readonly USER_OKF = 'user_okf';
  private static readonly PROJECT_OKF = 'project_okf';
  private static readonly SCOUT_DRAFTS = 'scout_drafts';

  /** Base dir for global/user tiers: ~/.neurosync/ */
  private static get homeBase(): string {
    return path.join(os.homedir(), this.NEUROSYNC_DIR);
  }

  /** Resolve the GLOBAL OKF directory (creates if missing) */
  public static resolveGlobalDir(): string {
    const dir = path.join(this.homeBase, this.GLOBAL_OKF);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Resolve the USER OKF directory (creates if missing) */
  public static resolveUserDir(): string {
    const dir = path.join(this.homeBase, this.USER_OKF);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Resolve the PROJECT OKF directory (creates if missing). Returns null if project has no root path. */
  public static resolveProjectDir(projectId: string): string | null {
    const project = db.prepare('SELECT project_root_path FROM projects WHERE id = ?').get(projectId) as { project_root_path: string | null } | undefined;
    if (!project?.project_root_path) return null;

    const dir = path.join(project.project_root_path, this.NEUROSYNC_DIR, this.PROJECT_OKF);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Resolve the SCOUT DRAFTS directory (creates if missing). Returns null if project has no root path. */
  public static resolveScoutDraftsDir(projectId: string): string | null {
    const project = db.prepare('SELECT project_root_path FROM projects WHERE id = ?').get(projectId) as { project_root_path: string | null } | undefined;
    if (!project?.project_root_path) return null;

    const dir = path.join(project.project_root_path, this.NEUROSYNC_DIR, this.SCOUT_DRAFTS);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Get all OKF directories for a given context (for scanning/indexing).
   * Returns directories in resolution order: PROJECT, USER, GLOBAL.
   */
  public static getAllDirsForContext(projectId?: string): { tier: 'GLOBAL' | 'USER' | 'PROJECT'; dir: string }[] {
    const result: { tier: 'GLOBAL' | 'USER' | 'PROJECT'; dir: string }[] = [];

    if (projectId) {
      const projectDir = this.resolveProjectDir(projectId);
      if (projectDir) result.push({ tier: 'PROJECT', dir: projectDir });
    }

    result.push({ tier: 'USER', dir: this.resolveUserDir() });
    result.push({ tier: 'GLOBAL', dir: this.resolveGlobalDir() });

    return result;
  }

  /**
   * List all .md files in an OKF directory (recursive).
   */
  public static listMarkdownFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];

    const results: string[] = [];
    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(fullPath);
        }
      }
    };
    walk(dir);
    return results;
  }

  /**
   * Ensure the index.md and log.md files exist in an OKF directory.
   * Creates them with initial content if missing.
   */
  public static ensureManifestFiles(dir: string): void {
    const indexPath = path.join(dir, 'index.md');
    const logPath = path.join(dir, 'log.md');

    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, `---\ntype: index\ntitle: Knowledge Graph Index\n---\n\n# OKF Directory Index\n\nThis file is auto-generated. It lists all concept files in this directory.\n`);
    }

    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, `---\ntype: log\ntitle: Change Log\n---\n\n# OKF Change Log\n\nChronological record of knowledge graph modifications.\n`);
    }
  }
}

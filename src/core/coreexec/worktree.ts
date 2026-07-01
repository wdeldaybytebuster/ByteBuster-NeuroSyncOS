import path from 'path';
import fs from 'fs';
import { db } from '../basevault/db';

/**
 * Manages hyper-isolated .nexus_worktrees/ directories for draft AI code proposals.
 * 
 * When a DAG workflow produces file mutations (code generation, edits), those changes
 * are written to a quarantined worktree directory INSIDE the user's project_root_path
 * rather than directly modifying the primary codebase. This ensures:
 * 
 * 1. All AI-drafted mutations remain draft-only until human approval
 * 2. The user's primary codebase integrity is never compromised
 * 3. Multiple concurrent proposals can exist in separate worktrees
 * 4. Rejected proposals are cleanly deleted without git history pollution
 */
export class WorktreeIsolation {
  private static readonly WORKTREE_DIR = '.nexus_worktrees';

  /**
   * Resolve the .nexus_worktrees/ base directory for a project.
   * Creates the directory if it doesn't exist.
   * Returns null if the project has no project_root_path configured.
   */
  public static resolveWorktreeBase(projectId: string): string | null {
    const project = db.prepare('SELECT project_root_path FROM projects WHERE id = ?').get(projectId) as { project_root_path: string | null } | undefined;

    if (!project?.project_root_path) {
      return null;
    }

    const worktreeBase = path.join(project.project_root_path, this.WORKTREE_DIR);

    if (!fs.existsSync(worktreeBase)) {
      fs.mkdirSync(worktreeBase, { recursive: true });
    }

    return worktreeBase;
  }

  /**
   * Create a new isolated worktree for a specific workflow run.
   * Returns the absolute path to the run-specific worktree directory.
   * Returns null if project_root_path is not configured.
   */
  public static createRunWorktree(projectId: string, runId: string): string | null {
    const base = this.resolveWorktreeBase(projectId);
    if (!base) return null;

    const runWorktree = path.join(base, runId);

    if (!fs.existsSync(runWorktree)) {
      fs.mkdirSync(runWorktree, { recursive: true });
    }

    return runWorktree;
  }

  /**
   * Delete a worktree after rejection or after changes have been applied.
   */
  public static removeRunWorktree(projectId: string, runId: string): boolean {
    const base = this.resolveWorktreeBase(projectId);
    if (!base) return false;

    const runWorktree = path.join(base, runId);

    if (fs.existsSync(runWorktree)) {
      fs.rmSync(runWorktree, { recursive: true, force: true });
      return true;
    }

    return false;
  }

  /**
   * List all active worktrees for a project.
   */
  public static listWorktrees(projectId: string): string[] {
    const base = this.resolveWorktreeBase(projectId);
    if (!base || !fs.existsSync(base)) return [];

    try {
      return fs.readdirSync(base).filter(entry => {
        const fullPath = path.join(base, entry);
        return fs.statSync(fullPath).isDirectory();
      });
    } catch {
      return [];
    }
  }

  /**
   * Get the worktree path for a run, or null if it doesn't exist.
   */
  public static getRunWorktreePath(projectId: string, runId: string): string | null {
    const base = this.resolveWorktreeBase(projectId);
    if (!base) return null;

    const runWorktree = path.join(base, runId);
    return fs.existsSync(runWorktree) ? runWorktree : null;
  }
}

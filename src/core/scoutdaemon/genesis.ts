import { db } from '../basevault/db';
import { log } from '../observability/logger';
import { stagePendingRun } from './stage-run';
import crypto from 'crypto';

/**
 * Genesis Pipeline / Skill Bootstrapping (Phase 9)
 * 
 * Actively investigates the codebase (via OKF indexing) to evaluate and 
 * identify the highest-ROI "Best Skills" to generate first.
 */
export class GenesisBootstrapper {

  /**
   * Scans the indexed `okf_nodes` or `scout_okf_nodes` to identify gaps and
   * generate high-priority skill drafts.
   */
  public static bootstrapSkills(projectId: string) {
    log.info(`[GenesisBootstrapper] Initiating skill bootstrapping for project ${projectId}...`);

    try {
      // 1. Analyze the graph to find high-impact, frequently called modules
      // which lack test coverage or documentation, OR identify core domain objects.
      const nodes = db.prepare(`
        SELECT id, file_path, type, title
        FROM okf_nodes
        WHERE project_id = ? AND type IN ('class', 'function')
        LIMIT 50
      `).all(projectId) as any[];

      if (nodes.length === 0) {
        log.warn(`[GenesisBootstrapper] No OKF nodes found for project ${projectId}. Run AST Indexing first.`);
        return;
      }

      // We'll queue a task in ScopeLogic (via workflow_runs) to evaluate these nodes
      // and auto-generate the 'Best Skills'. P3-S9 — staged via the shared
      // ScoutDaemon chokepoint (no ensureProjectName: the caller owns this
      // project's lifecycle — see stage-run.ts divergence note).
      const runId = stagePendingRun({
        projectId,
        nodes: [
          {
            id: crypto.randomUUID(),
            plugin: 'skill_evaluator',
            dependencies: [],
            params: { targetNodes: nodes.map(n => n.id), limit: 3 }, // Find top 3 skills to generate
          },
        ],
        track: 'track2',
        stagedEvent: 'GENESIS_BOOTSTRAP_STAGED',
        eventExtra: { projectId },
      });

      if (runId) {
        log.info(`[GenesisBootstrapper] Staged Genesis Skill Evaluation run ${runId} for project ${projectId}.`);
      }
    } catch (err) {
      log.error(`[GenesisBootstrapper] Bootstrapping failed:`, err);
    }
  }
}

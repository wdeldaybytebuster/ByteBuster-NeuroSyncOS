import { Hono } from 'hono';
import { db } from '../../core/basevault/db';
import { OKFIndexer } from '../../core/okf/indexer';
import { OKFGraphQuery } from '../../core/okf/graph-query';
import { OKFGenerator } from '../../core/okf/generator';
import { ScoutResearch } from '../../core/scoutdaemon/research';
import { OKFDirectoryManager } from '../../core/okf/directory-manager';
import { scanProjectForDocs } from '../../core/okf/project-scanner';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export const okfRouter = new Hono();

// 1. List indexed OKF nodes
okfRouter.get('/nodes', (c) => {
  try {
    const tier = c.req.query('tier') as 'GLOBAL' | 'USER' | 'PROJECT' | undefined;
    const type = c.req.query('type');
    const projectId = c.req.query('projectId');
    const limit = parseInt(c.req.query('limit') || '50', 10);

    const nodes = OKFGraphQuery.searchNodes({ tier, type: type || undefined, projectId: projectId || undefined, limit });
    return c.json({ success: true, nodes, count: nodes.length });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 2. Get a single node with its edges
okfRouter.get('/nodes/:id', (c) => {
  try {
    const { id } = c.req.param();
    const node = db.prepare('SELECT * FROM okf_nodes WHERE id = ?').get(id) as any;
    if (!node) return c.json({ success: false, error: 'Node not found' }, 404);

    const outgoing = db.prepare('SELECT target_node_id, relationship_type FROM okf_edges WHERE source_node_id = ?').all(id);
    const incoming = db.prepare('SELECT source_node_id, relationship_type FROM okf_edges WHERE target_node_id = ?').all(id);

    return c.json({ success: true, node, edges: { outgoing, incoming } });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 3. Search nodes with graph expansion
okfRouter.post('/search', async (c) => {
  try {
    const { query, projectId } = await c.req.json();
    if (!query) return c.json({ success: false, error: 'query is required' }, 400);

    const chunks = OKFGraphQuery.resolveContext(query, projectId);
    const formatted = OKFGraphQuery.formatContextForPrompt(chunks);

    return c.json({ success: true, chunks, formatted, count: chunks.length });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 4. Trigger manual re-indexing
okfRouter.post('/index', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const projectId = (body as any)?.projectId;

    const result = OKFIndexer.indexAll(projectId);
    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 5. Generate OKF from document
okfRouter.post('/generate/document', async (c) => {
  try {
    const { text, tier, projectId } = await c.req.json();
    if (!text) return c.json({ success: false, error: 'text is required' }, 400);

    // Use the injected LLM generate function (set below via injection)
    if (!_generateFn) return c.json({ success: false, error: 'LLM not configured' }, 500);

    const paths = await OKFGenerator.fromDocument(_generateFn, text, tier || 'PROJECT', projectId);
    return c.json({ success: true, generatedFiles: paths.length, paths });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 6. Generate OKF from chat transcript
okfRouter.post('/generate/chat', async (c) => {
  try {
    const { history, tier, projectId } = await c.req.json();
    if (!history || !Array.isArray(history)) return c.json({ success: false, error: 'history array is required' }, 400);

    if (!_generateFn) return c.json({ success: false, error: 'LLM not configured' }, 500);

    const paths = await OKFGenerator.fromChat(_generateFn, history, tier || 'USER', projectId);
    return c.json({ success: true, generatedFiles: paths.length, paths });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 7. List scout drafts
okfRouter.get('/scout-drafts', (c) => {
  try {
    const projectId = c.req.query('projectId');
    const drafts = ScoutResearch.listDrafts(projectId || undefined);
    return c.json({ success: true, drafts, count: drafts.length });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 8. Promote a scout draft
okfRouter.post('/scout-drafts/:id/promote', (c) => {
  try {
    const { id } = c.req.param();
    const success = ScoutResearch.promote(id);
    if (!success) return c.json({ success: false, error: 'Draft not found or already promoted/rejected' }, 404);
    return c.json({ success: true, message: 'Draft promoted to active knowledge graph.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 9. Reject a scout draft
okfRouter.post('/scout-drafts/:id/reject', (c) => {
  try {
    const { id } = c.req.param();
    const success = ScoutResearch.reject(id);
    if (!success) return c.json({ success: false, error: 'Draft not found or already promoted/rejected' }, 404);
    return c.json({ success: true, message: 'Draft rejected and deleted.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OKF PROJECT WORKSPACE STATUS & SYNC
// Phase 6/7: OKF-Shift — Project Knowledge Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

const ProjectIdSchema = z.string().uuid().or(z.string().min(1));

// 10. GET /api/okf/status — Project OKF workspace health
okfRouter.get('/status', (c) => {
  try {
    const rawProjectId = c.req.query('projectId');
    const parsed = ProjectIdSchema.safeParse(rawProjectId);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Invalid or missing projectId query parameter.' }, 400);
    }
    const projectId = parsed.data;

    // Resolve the project's OKF directory
    const project = db.prepare('SELECT project_root_path FROM projects WHERE id = ?').get(projectId) as { project_root_path: string | null } | undefined;
    if (!project) {
      return c.json({ success: false, error: 'Project not found.' }, 404);
    }
    if (!project.project_root_path) {
      return c.json({ success: false, error: 'Project has no project_root_path configured.', folderExists: false }, 400);
    }

    const okfDir = path.join(project.project_root_path, '.neurosync', 'project_okf');
    const folderExists = fs.existsSync(okfDir);

    // Scan disk for .md files
    let diskFiles: string[] = [];
    if (folderExists) {
      diskFiles = OKFDirectoryManager.listMarkdownFiles(okfDir).map(f => path.relative(okfDir, f));
    }

    // Query BaseVault for indexed nodes for this project
    const indexedRows = db.prepare(
      "SELECT id, file_path, confidence, type, title FROM okf_nodes WHERE tier = 'PROJECT' AND project_id = ?"
    ).all(projectId) as { id: string; file_path: string; confidence: number; type: string; title: string | null }[];

    const indexedFiles = indexedRows.map(r => ({
      id: r.id,
      relativePath: path.relative(okfDir, r.file_path),
      confidence: r.confidence,
      type: r.type,
      title: r.title,
    }));

    // Compute sync status
    const diskSet = new Set(diskFiles);
    const indexedPathSet = new Set(indexedFiles.map(f => f.relativePath));
    const isSynced = folderExists && diskFiles.length > 0 &&
      diskFiles.every(f => indexedPathSet.has(f)) &&
      indexedFiles.every(f => diskSet.has(f.relativePath));

    // Categorize drift
    const unindexed = diskFiles.filter(f => !indexedPathSet.has(f));
    const orphaned = indexedFiles.filter(f => !diskSet.has(f.relativePath));

    return c.json({
      success: true,
      projectId,
      folderPath: okfDir,
      folderExists,
      diskFiles,
      indexedFiles,
      isSynced,
      drift: {
        unindexed,   // files on disk but not in DB
        orphaned,    // in DB but not on disk
      },
      counts: {
        disk: diskFiles.length,
        indexed: indexedFiles.length,
        unindexed: unindexed.length,
        orphaned: orphaned.length,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 10.5 POST /api/okf/scan-project — Discover raw documentation in the project tree
// Logic lives in core/okf/project-scanner.ts so it can also be called in-process
// (e.g. auto-scan when a PortGrid terminal session for the project closes).
okfRouter.post('/scan-project', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = ProjectIdSchema.safeParse(body?.projectId);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Invalid or missing projectId in request body.' }, 400);
    }

    const result = scanProjectForDocs(parsed.data);
    if (!result.success) {
      return c.json({ success: false, error: result.error }, result.httpStatus);
    }
    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 10.6 POST /api/okf/convert-document — Convert a specific project document into OKF
okfRouter.post('/convert-document', async (c) => {
  try {
    const body = await c.req.json();
    const { projectId, filePath } = body;

    if (!projectId || !filePath) {
      return c.json({ success: false, error: 'projectId and filePath are required.' }, 400);
    }

    // Validate project
    const project = db.prepare('SELECT project_root_path FROM projects WHERE id = ?').get(projectId) as { project_root_path: string | null } | undefined;
    if (!project?.project_root_path) {
      return c.json({ success: false, error: 'Project has no project_root_path configured.' }, 400);
    }

    // Resolve absolute path and validate it's within the project root
    const absolutePath = path.resolve(project.project_root_path, filePath);
    if (!absolutePath.startsWith(project.project_root_path)) {
      return c.json({ success: false, error: 'Path traversal detected.' }, 400);
    }

    if (!fs.existsSync(absolutePath)) {
      return c.json({ success: false, error: 'File not found.' }, 404);
    }

    // Read the file content
    const content = fs.readFileSync(absolutePath, 'utf-8');
    if (!content.trim()) {
      return c.json({ success: false, error: 'File is empty.' }, 400);
    }

    // Use the LLM generator to extract concepts and create OKF files
    if (!_generateFn) {
      return c.json({ success: false, error: 'LLM not configured. Add a provider in RouteSwitch → Set-up.' }, 500);
    }

    const generatedPaths = await OKFGenerator.fromDocument(_generateFn, content, 'PROJECT', projectId);

    // Only mark as processed if concepts were actually generated
    if (generatedPaths.length === 0) {
      return c.json({
        success: false,
        error: 'LLM did not produce any extractable concepts from this document. The model may have returned non-JSON output. Try a different provider or check that the document contains extractable knowledge.',
        sourceFile: filePath,
        generatedFiles: 0,
      }, 422);
    }

    // Mark this source doc as processed (only on success)
    const processedKey = `okf_processed_docs_${projectId}`;
    const existingRow = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(processedKey) as { value: string } | undefined;
    const processedList: string[] = existingRow ? JSON.parse(existingRow.value) : [];
    if (!processedList.includes(filePath)) {
      processedList.push(filePath);
      db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(processedKey, JSON.stringify(processedList));
    }

    return c.json({
      success: true,
      message: `Converted "${filePath}" into ${generatedPaths.length} OKF concept(s).`,
      sourceFile: filePath,
      generatedFiles: generatedPaths.length,
      paths: generatedPaths.map(p => path.relative(project.project_root_path!, p)),
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 11. POST /api/okf/sync — Manual trigger for OKF indexing
okfRouter.post('/sync', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = ProjectIdSchema.safeParse(body?.projectId);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Invalid or missing projectId in request body.' }, 400);
    }
    const projectId = parsed.data;

    // Resolve project directory
    const projectDir = OKFDirectoryManager.resolveProjectDir(projectId);
    if (!projectDir) {
      return c.json({ success: false, error: 'Project has no project_root_path configured or project not found.' }, 400);
    }

    // Ensure manifest files exist
    OKFDirectoryManager.ensureManifestFiles(projectDir);

    // Run indexer on the project OKF directory
    const result = OKFIndexer.indexDirectory(projectDir, 'PROJECT', projectId);

    // Also prune orphans (nodes in DB whose files no longer exist on disk)
    const pruned = OKFIndexer.pruneOrphans(projectDir);

    return c.json({
      success: true,
      message: `OKF sync complete for project ${projectId}.`,
      result: {
        indexed: result.indexed,
        skipped: result.skipped,
        pendingReview: result.pendingReview,
        rejected: result.rejected,
        errors: result.errors,
        pruned,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 12. GET /api/okf/graph — Return full node+edge graph data for mindmap visualization
okfRouter.get('/graph', (c) => {
  try {
    const tier = c.req.query('tier') as 'GLOBAL' | 'USER' | 'PROJECT' | undefined;
    const projectId = c.req.query('projectId');

    // Build WHERE clause based on tier filter
    let whereClause = '';
    const params: any[] = [];

    if (tier === 'PROJECT' && projectId) {
      whereClause = "WHERE tier = 'PROJECT' AND project_id = ?";
      params.push(projectId);
    } else if (tier === 'USER') {
      whereClause = "WHERE tier = 'USER'";
    } else if (tier === 'GLOBAL') {
      whereClause = "WHERE tier = 'GLOBAL'";
    } else if (projectId) {
      // Show all tiers relevant to this project context
      whereClause = "WHERE (tier = 'GLOBAL' OR tier = 'USER' OR (tier = 'PROJECT' AND project_id = ?))";
      params.push(projectId);
    }

    const nodes = db.prepare(`
      SELECT id, tier, type, title, confidence, file_path
      FROM okf_nodes
      ${whereClause}
      ORDER BY tier ASC, type ASC
    `).all(...params) as { id: string; tier: string; type: string; title: string | null; confidence: number; file_path: string }[];

    // Get all edges between the retrieved nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    const allEdges = db.prepare('SELECT source_node_id, target_node_id, relationship_type FROM okf_edges').all() as { source_node_id: string; target_node_id: string; relationship_type: string }[];
    const edges = allEdges.filter(e => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id));

    return c.json({ success: true, nodes, edges, counts: { nodes: nodes.length, edges: edges.length } });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 13. GET /api/okf/file-content — Read an OKF file's raw content for preview
okfRouter.get('/file-content', (c) => {
  try {
    const nodeId = c.req.query('nodeId');
    if (!nodeId) return c.json({ success: false, error: 'nodeId query param required' }, 400);

    const node = db.prepare('SELECT file_path, title, type, tier, confidence FROM okf_nodes WHERE id = ?').get(nodeId) as { file_path: string; title: string | null; type: string; tier: string; confidence: number } | undefined;
    if (!node) return c.json({ success: false, error: 'Node not found' }, 404);

    if (!fs.existsSync(node.file_path)) {
      return c.json({ success: false, error: 'File no longer exists on disk' }, 404);
    }

    const content = fs.readFileSync(node.file_path, 'utf-8');
    return c.json({ success: true, nodeId, title: node.title, type: node.type, tier: node.tier, confidence: node.confidence, content });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// LLM generate function injection (set from server/index.ts)
let _generateFn: ((prompt: string, schema?: any) => Promise<string>) | null = null;
export function injectOKFGenerateFn(fn: (prompt: string, schema?: any) => Promise<string>) {
  _generateFn = fn;
}

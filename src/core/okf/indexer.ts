import { db } from '../basevault/db';
import { OKFParser, ParsedOKFFile } from './parser';
import { OKFDirectoryManager } from './directory-manager';
import path from 'path';

export interface IndexResult {
  indexed: number;
  skipped: number;
  pendingReview: number;
  rejected: number;
  errors: string[];
}

/**
 * Scans OKF directories, parses Markdown files, and upserts the knowledge graph
 * into BaseVault's okf_nodes + okf_edges tables.
 * 
 * Confidence gates:
 * - >= 0.95: Auto-indexed (immediately available to agents)
 * - 0.80-0.94: File exists but NOT indexed (amber badge, awaits approval)
 * - < 0.80: Rejected (logged to os_todos, not written)
 */
export class OKFIndexer {

  /**
   * Index all OKF directories for a given context.
   * Scans PROJECT, USER, and GLOBAL tiers in resolution order.
   */
  public static indexAll(projectId?: string): IndexResult {
    const dirs = OKFDirectoryManager.getAllDirsForContext(projectId);
    const totalResult: IndexResult = { indexed: 0, skipped: 0, pendingReview: 0, rejected: 0, errors: [] };

    for (const { tier, dir } of dirs) {
      const result = this.indexDirectory(dir, tier, projectId || null);
      totalResult.indexed += result.indexed;
      totalResult.skipped += result.skipped;
      totalResult.pendingReview += result.pendingReview;
      totalResult.rejected += result.rejected;
      totalResult.errors.push(...result.errors);
    }

    return totalResult;
  }

  /**
   * Index a single OKF directory.
   */
  public static indexDirectory(dir: string, tier: 'GLOBAL' | 'USER' | 'PROJECT', projectId: string | null): IndexResult {
    const result: IndexResult = { indexed: 0, skipped: 0, pendingReview: 0, rejected: 0, errors: [] };
    const files = OKFDirectoryManager.listMarkdownFiles(dir);

    const upsertNode = db.prepare(`
      INSERT INTO okf_nodes (id, tier, project_id, type, title, confidence, content_hash, frontmatter_json, file_path, last_indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        title = excluded.title,
        confidence = excluded.confidence,
        content_hash = excluded.content_hash,
        frontmatter_json = excluded.frontmatter_json,
        last_indexed_at = excluded.last_indexed_at
    `);

    const upsertEdge = db.prepare(`
      INSERT OR IGNORE INTO okf_edges (source_node_id, target_node_id, relationship_type)
      VALUES (?, ?, ?)
    `);

    const getExistingHash = db.prepare(`SELECT content_hash FROM okf_nodes WHERE id = ?`);

    db.transaction(() => {
      for (const filePath of files) {
        const parsed = OKFParser.parseFile(filePath);

        if (!parsed.isValid) {
          result.errors.push(`${filePath}: ${parsed.error}`);
          continue;
        }

        // Derive node ID from relative path within the OKF directory
        const relativePath = path.relative(dir, filePath);
        const nodeId = relativePath.replace(/\.md$/, '').replace(/\\/g, '/');

        // Confidence gate
        const confidence = parsed.frontmatter.confidence ?? 1.0;
        if (confidence < 0.80) {
          result.rejected++;
          continue;
        }
        if (confidence < 0.95) {
          result.pendingReview++;
          // File exists on disk but we skip indexing — operator must approve
          continue;
        }

        // SHA-256 dedup: skip if content hasn't changed
        const existing = getExistingHash.get(nodeId) as { content_hash: string } | undefined;
        if (existing && existing.content_hash === parsed.contentHash) {
          result.skipped++;
          continue;
        }

        // Upsert node
        const now = Date.now();
        upsertNode.run(
          nodeId,
          tier,
          tier === 'PROJECT' ? projectId : null,
          parsed.frontmatter.type,
          parsed.frontmatter.title || null,
          confidence,
          parsed.contentHash,
          parsed.frontmatterJson,
          filePath,
          now
        );
        result.indexed++;

        // Upsert edges from parsed links
        for (const link of parsed.links) {
          const targetRelative = path.relative(dir, link.resolvedPath);
          const targetNodeId = targetRelative.replace(/\.md$/, '').replace(/\\/g, '/');
          upsertEdge.run(nodeId, targetNodeId, 'references');
        }
      }
    })();

    return result;
  }

  /**
   * Remove nodes that no longer have corresponding files on disk (orphan cleanup).
   */
  public static pruneOrphans(dir: string): number {
    const existingFiles = new Set(OKFDirectoryManager.listMarkdownFiles(dir));
    const dbNodes = db.prepare(`SELECT id, file_path FROM okf_nodes WHERE file_path LIKE ?`).all(`${dir}%`) as { id: string; file_path: string }[];

    let pruned = 0;
    const deleteNode = db.prepare('DELETE FROM okf_nodes WHERE id = ?');

    db.transaction(() => {
      for (const node of dbNodes) {
        if (!existingFiles.has(node.file_path)) {
          deleteNode.run(node.id);
          pruned++;
        }
      }
    })();

    return pruned;
  }
}

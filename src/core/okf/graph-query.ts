import { db } from '../basevault/db';
import fs from 'fs';

export interface OKFNode {
  id: string;
  tier: 'GLOBAL' | 'USER' | 'PROJECT';
  projectId: string | null;
  type: string;
  title: string | null;
  confidence: number;
  filePath: string;
}

export interface OKFContextChunk {
  nodeId: string;
  tier: string;
  type: string;
  title: string;
  content: string;
  confidence: number;
}

/**
 * Graph traversal and context resolution for the OKF knowledge graph.
 *
 * Depth limit: MAX_DEPTH = 2 (prevents explosion on dense graphs)
 * Cycle prevention: visited-set tracking during BFS
 * Token budget: resolveContext truncates lowest-confidence nodes first
 */
export class OKFGraphQuery {
  private static readonly MAX_DEPTH = 2;
  private static readonly MAX_CONTEXT_CHARS = 8000; // ~2000 tokens

  /**
   * Search nodes by type and/or keyword in title.
   * Filters by tier and active project.
   */
  public static searchNodes(opts: {
    type?: string | undefined;
    keyword?: string | undefined;
    tier?: 'GLOBAL' | 'USER' | 'PROJECT' | undefined;
    projectId?: string | undefined;
    limit?: number | undefined;
  }): OKFNode[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.type) {
      conditions.push('type = ?');
      params.push(opts.type);
    }
    if (opts.keyword) {
      conditions.push('(title LIKE ? OR id LIKE ?)');
      params.push(`%${opts.keyword}%`, `%${opts.keyword}%`);
    }
    if (opts.tier) {
      conditions.push('tier = ?');
      params.push(opts.tier);
    }
    if (opts.projectId) {
      conditions.push('(project_id = ? OR project_id IS NULL)');
      params.push(opts.projectId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts.limit || 20;

    const rows = db.prepare(`
      SELECT id, tier, project_id, type, title, confidence, file_path
      FROM okf_nodes
      ${where}
      ORDER BY confidence DESC, last_indexed_at DESC
      LIMIT ?
    `).all(...params, limit) as {
      id: string;
      tier: 'GLOBAL' | 'USER' | 'PROJECT';
      project_id: string | null;
      type: string;
      title: string | null;
      confidence: number;
      file_path: string;
    }[];

    return rows.map(r => ({
      id: r.id,
      tier: r.tier,
      projectId: r.project_id,
      type: r.type,
      title: r.title,
      confidence: r.confidence,
      filePath: r.file_path,
    }));
  }

  /**
   * BFS traversal: get all related nodes within MAX_DEPTH hops.
   * Uses a visited-set to prevent cycles.
   */
  public static getRelated(nodeId: string, maxDepth: number = this.MAX_DEPTH): OKFNode[] {
    const visited = new Set<string>();
    const result: OKFNode[] = [];
    let frontier = [nodeId];
    visited.add(nodeId);

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];

      for (const currentId of frontier) {
        // Get outgoing edges
        const outgoing = db.prepare(
          'SELECT target_node_id FROM okf_edges WHERE source_node_id = ?'
        ).all(currentId) as { target_node_id: string }[];

        // Get incoming edges (bidirectional traversal)
        const incoming = db.prepare(
          'SELECT source_node_id FROM okf_edges WHERE target_node_id = ?'
        ).all(currentId) as { source_node_id: string }[];

        const neighbors = [
          ...outgoing.map(r => r.target_node_id),
          ...incoming.map(r => r.source_node_id),
        ];

        for (const neighborId of neighbors) {
          if (visited.has(neighborId)) continue;
          visited.add(neighborId);
          nextFrontier.push(neighborId);

          // Fetch the node details
          const node = db.prepare(
            'SELECT id, tier, project_id, type, title, confidence, file_path FROM okf_nodes WHERE id = ?'
          ).get(neighborId) as {
            id: string;
            tier: 'GLOBAL' | 'USER' | 'PROJECT';
            project_id: string | null;
            type: string;
            title: string | null;
            confidence: number;
            file_path: string;
          } | undefined;

          if (node) {
            result.push({
              id: node.id,
              tier: node.tier,
              projectId: node.project_id,
              type: node.type,
              title: node.title,
              confidence: node.confidence,
              filePath: node.file_path,
            });
          }
        }
      }

      frontier = nextFrontier;
    }

    return result;
  }

  /**
   * Resolve context for a prompt: find relevant OKF nodes and return their content
   * for injection into the LLM prompt. Respects token budget by truncating
   * lowest-confidence chunks first.
   */
  public static resolveContext(query: string, projectId?: string): OKFContextChunk[] {
    // 1. Search for directly relevant nodes
    const directMatches = this.searchNodes({ keyword: query, projectId, limit: 5 });

    // 2. Get related nodes for each direct match (depth=2)
    const allNodeIds = new Set<string>();
    const allNodes: OKFNode[] = [];

    for (const match of directMatches) {
      if (!allNodeIds.has(match.id)) {
        allNodeIds.add(match.id);
        allNodes.push(match);
      }
      const related = this.getRelated(match.id);
      for (const rel of related) {
        if (!allNodeIds.has(rel.id)) {
          allNodeIds.add(rel.id);
          allNodes.push(rel);
        }
      }
    }

    // 3. Sort by confidence descending (highest-quality facts first)
    allNodes.sort((a, b) => b.confidence - a.confidence);

    // 4. Read file content and build chunks, respecting token budget
    const chunks: OKFContextChunk[] = [];
    let totalChars = 0;

    for (const node of allNodes) {
      if (totalChars >= this.MAX_CONTEXT_CHARS) break;

      try {
        if (!fs.existsSync(node.filePath)) continue;
        const raw = fs.readFileSync(node.filePath, 'utf-8');

        // Strip frontmatter, keep body only
        const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
        const body = bodyMatch ? bodyMatch[1]!.trim() : raw.trim();

        // Truncate individual chunk if it would exceed budget
        const remaining = this.MAX_CONTEXT_CHARS - totalChars;
        const truncatedBody = body.length > remaining ? body.substring(0, remaining) + '...' : body;

        chunks.push({
          nodeId: node.id,
          tier: node.tier,
          type: node.type,
          title: node.title || node.id,
          content: truncatedBody,
          confidence: node.confidence,
        });

        totalChars += truncatedBody.length;
      } catch {
        // Skip unreadable files
        continue;
      }
    }

    return chunks;
  }

  /**
   * Format resolved context chunks into a prompt-injection string.
   */
  public static formatContextForPrompt(chunks: OKFContextChunk[]): string {
    if (chunks.length === 0) return '';

    const lines = ['[KNOWLEDGE CONTEXT — from curated OKF graph]'];
    for (const chunk of chunks) {
      lines.push(`\n--- ${chunk.title} (${chunk.type}, ${chunk.tier}, conf=${chunk.confidence.toFixed(2)}) ---`);
      lines.push(chunk.content);
    }
    lines.push('\n[END KNOWLEDGE CONTEXT]\n');

    return lines.join('\n');
  }
}

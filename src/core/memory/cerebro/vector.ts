import { db } from '../../basevault/db';
import crypto from 'crypto';

export interface MemoryRecord {
  id: string;
  content: string;
  type: string;
  project_id?: string | null;
  last_accessed_at: number;
  access_count: number;
  created_at: number;
  similarity?: number;
}

export class CerebroVectorStore {
  /**
   * Inserts a memory into the vector store.
   * If embedding is null, it relies entirely on the Keyword Fallback Engine for retrieval.
   * projectId null/undefined = GLOBAL/USER-tier memory, visible to every project.
   */
  public static insert(content: string, type: string, embedding?: Float32Array, projectId?: string | null): string {
    const id = crypto.randomUUID();
    const now = Date.now();

    // 1. Insert Meta
    db.prepare(`
      INSERT INTO cerebro_memories_meta (id, content, type, project_id, last_accessed_at, access_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, content, type, projectId ?? null, now, 0, now);

    // 2. Insert Vector if provided
    if (embedding) {
      db.prepare(`
        INSERT INTO cerebro_memories_vec (id, embedding)
        VALUES (?, ?)
      `).run(id, embedding);
    }

    return id;
  }

  /**
   * Searches the memory.
   * If queryEmbedding is not provided (offline local mode), it seamlessly degrades to the Keyword Fallback Engine.
   * When projectId is provided, results are scoped to that project's PROJECT-tier
   * memories plus untagged (GLOBAL/USER-tier) memories — never another project's.
   */
  public static search(query: string, typeFilter?: string, queryEmbedding?: Float32Array, limit: number = 5, projectId?: string): MemoryRecord[] {
    if (queryEmbedding) {
      return this._vectorSearch(queryEmbedding, typeFilter, limit, projectId);
    } else {
      return this._keywordFallbackSearch(query, typeFilter, limit, projectId);
    }
  }

  private static _vectorSearch(embedding: Float32Array, typeFilter?: string, limit: number = 5, projectId?: string): MemoryRecord[] {
    const filterSQL = typeFilter ? `AND m.type = '${typeFilter}'` : '';
    const scopeSQL = projectId ? `AND (m.project_id = ? OR m.project_id IS NULL)` : '';

    const knnQuery = db.prepare(`
      SELECT m.id, m.content, m.type, m.project_id, m.last_accessed_at, m.access_count, m.created_at, v.distance
      FROM cerebro_memories_vec v
      JOIN cerebro_memories_meta m ON v.id = m.id
      WHERE v.embedding MATCH ? AND k = ?
      ${filterSQL}
      ${scopeSQL}
      ORDER BY v.distance ASC
    `);

    const params: unknown[] = [embedding, limit];
    if (projectId) params.push(projectId);
    const rows = knnQuery.all(...params) as any[];

    return rows.map(r => ({
      id: r.id,
      content: r.content,
      type: r.type,
      project_id: r.project_id,
      last_accessed_at: r.last_accessed_at,
      access_count: r.access_count,
      created_at: r.created_at,
      similarity: Math.max(0, 1.0 - r.distance) // Normalize distance into similarity score
    }));
  }

  private static _keywordFallbackSearch(query: string, typeFilter?: string, limit: number = 5, projectId?: string): MemoryRecord[] {
    // Deterministic fallback: Token filter length > 3
    // Formula: Similarity = 0.7 + (matchCount * 0.05)

    const queryTokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 3);

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (typeFilter) {
      conditions.push('type = ?');
      params.push(typeFilter);
    }
    if (projectId) {
      conditions.push('(project_id = ? OR project_id IS NULL)');
      params.push(projectId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM cerebro_memories_meta ${where}`;

    const allRecords = params.length > 0 ? db.prepare(sql).all(...params) : db.prepare(sql).all();

    const scoredRecords = (allRecords as any[]).map(record => {
      const contentTokens = record.content.toLowerCase().split(/\W+/).filter((t: string) => t.length > 3);
      
      let matchCount = 0;
      for (const qt of queryTokens) {
        if (contentTokens.includes(qt)) {
          matchCount++;
        }
      }

      const similarity = matchCount > 0 ? 0.7 + (matchCount * 0.05) : 0;
      
      return {
        ...record,
        similarity
      };
    });

    return scoredRecords
      .filter(r => r.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}

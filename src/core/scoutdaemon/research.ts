import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '../basevault/db';
import { OKFDirectoryManager } from '../okf/directory-manager';
import { OKFParser } from '../okf/parser';
import { OKFIndexer } from '../okf/indexer';

export interface ScoutDraft {
  id: string;
  projectId: string | null;
  type: string;
  title: string | null;
  confidence: number;
  filePath: string;
  status: 'draft' | 'promoted' | 'rejected';
  createdAt: number;
}

/**
 * ScoutDaemon Research Module.
 * 
 * All ScoutDaemon-generated OKF knowledge goes into the quarantined
 * `.neurosync/scout_drafts/` directory. Standard agents CANNOT access
 * this data unless explicitly granted the "Foresight" capability.
 * 
 * Promotion flow:
 * 1. ScoutDaemon writes .md files to scout_drafts/
 * 2. Files are indexed into scout_okf_nodes (separate from okf_nodes)
 * 3. Operator reviews in PortGrid → approves/rejects
 * 4. On approval: files physically moved to project_okf/, re-indexed into active graph
 */
export class ScoutResearch {

  /**
   * Ingest a research document into the quarantine directory.
   * Writes the OKF Markdown file and indexes into scout_okf_nodes.
   */
  public static ingest(opts: {
    projectId: string;
    type: string;
    title: string;
    content: string;
    confidence: number;
    tags?: string[];
  }): ScoutDraft | null {
    const draftsDir = OKFDirectoryManager.resolveScoutDraftsDir(opts.projectId);
    if (!draftsDir) return null;

    // Generate filename
    const slug = opts.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
    const filename = `${slug}.md`;
    const filePath = path.join(draftsDir, filename);

    // Write the OKF Markdown file
    const mdContent = `---
type: ${opts.type}
title: "${opts.title.replace(/"/g, '\\"')}"
confidence: ${opts.confidence.toFixed(2)}
tags: [${(opts.tags || []).map(t => `"${t}"`).join(', ')}]
source: scout-daemon
---

# ${opts.title}

${opts.content}
`;

    fs.writeFileSync(filePath, mdContent, 'utf-8');

    // Compute content hash
    const contentHash = crypto.createHash('sha256').update(mdContent).digest('hex');

    // Index into scout_okf_nodes (separate quarantine table)
    const id = `scout_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const now = Date.now();

    db.prepare(`
      INSERT INTO scout_okf_nodes (id, project_id, type, title, confidence, content_hash, frontmatter_json, file_path, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(id, opts.projectId, opts.type, opts.title, opts.confidence, contentHash,
      JSON.stringify({ type: opts.type, title: opts.title, confidence: opts.confidence, tags: opts.tags || [] }),
      filePath, now);

    return { id, projectId: opts.projectId, type: opts.type, title: opts.title, confidence: opts.confidence, filePath, status: 'draft', createdAt: now };
  }

  /**
   * Promote a scout draft into the active knowledge graph.
   * Physically moves the .md file from scout_drafts/ to project_okf/,
   * updates the scout_okf_nodes status, and re-indexes into okf_nodes.
   */
  public static promote(draftId: string): boolean {
    const draft = db.prepare('SELECT * FROM scout_okf_nodes WHERE id = ? AND status = ?').get(draftId, 'draft') as any;
    if (!draft) return false;

    const projectDir = draft.project_id ? OKFDirectoryManager.resolveProjectDir(draft.project_id) : null;
    if (!projectDir) return false;

    // Move file from scout_drafts/ to project_okf/
    const filename = path.basename(draft.file_path);
    const destPath = path.join(projectDir, filename);

    try {
      if (fs.existsSync(draft.file_path)) {
        fs.copyFileSync(draft.file_path, destPath);
        fs.unlinkSync(draft.file_path);
      }
    } catch (err) {
      console.error('[ScoutResearch] Failed to move file during promotion:', err);
      return false;
    }

    // Update scout_okf_nodes status
    db.prepare("UPDATE scout_okf_nodes SET status = 'promoted' WHERE id = ?").run(draftId);

    // Re-index the project OKF directory to pick up the promoted file
    OKFIndexer.indexDirectory(projectDir, 'PROJECT', draft.project_id);

    return true;
  }

  /**
   * Reject a scout draft. Deletes the file and marks as rejected.
   */
  public static reject(draftId: string): boolean {
    const draft = db.prepare('SELECT * FROM scout_okf_nodes WHERE id = ? AND status = ?').get(draftId, 'draft') as any;
    if (!draft) return false;

    // Delete the file
    try {
      if (fs.existsSync(draft.file_path)) {
        fs.unlinkSync(draft.file_path);
      }
    } catch {}

    // Update status
    db.prepare("UPDATE scout_okf_nodes SET status = 'rejected' WHERE id = ?").run(draftId);

    return true;
  }

  /**
   * List all draft (pending) scout discoveries for a project.
   */
  public static listDrafts(projectId?: string): ScoutDraft[] {
    const rows = projectId
      ? db.prepare("SELECT * FROM scout_okf_nodes WHERE status = 'draft' AND project_id = ? ORDER BY created_at DESC").all(projectId)
      : db.prepare("SELECT * FROM scout_okf_nodes WHERE status = 'draft' ORDER BY created_at DESC").all();

    return (rows as any[]).map(r => ({
      id: r.id,
      projectId: r.project_id,
      type: r.type,
      title: r.title,
      confidence: r.confidence,
      filePath: r.file_path,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  /**
   * Get the content of a draft file for preview.
   */
  public static getDraftContent(draftId: string): string | null {
    const draft = db.prepare('SELECT file_path FROM scout_okf_nodes WHERE id = ?').get(draftId) as { file_path: string } | undefined;
    if (!draft?.file_path || !fs.existsSync(draft.file_path)) return null;
    return fs.readFileSync(draft.file_path, 'utf-8');
  }
}

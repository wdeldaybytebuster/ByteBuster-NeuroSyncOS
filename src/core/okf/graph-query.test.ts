import { describe, it, expect, beforeEach } from 'vitest';
import { db, initDB } from '../basevault/db';
import { OKFGraphQuery } from './graph-query';

function ensureProject(projectId: string) {
  db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, created_at) VALUES (?, ?, ?)
  `).run(projectId, projectId, Date.now());
}

function insertNode(opts: {
  id: string;
  tier: 'GLOBAL' | 'USER' | 'PROJECT';
  projectId: string | null;
  title: string;
}) {
  if (opts.projectId) ensureProject(opts.projectId);
  db.prepare(`
    INSERT INTO okf_nodes (id, tier, project_id, type, title, confidence, file_path, last_indexed_at)
    VALUES (?, ?, ?, 'decision', ?, 1.0, ?, ?)
  `).run(opts.id, opts.tier, opts.projectId, opts.title, `/tmp/okf-test/${opts.id}.md`, Date.now());
}

describe('OKFGraphQuery.searchNodes', () => {
  beforeEach(() => {
    initDB();
    db.prepare('DELETE FROM okf_nodes').run();
    db.prepare('DELETE FROM okf_edges').run();
    db.prepare("DELETE FROM projects WHERE id LIKE 'proj-%'").run();
  });

  it('matches a short title against a long multi-sentence query via tokenization', () => {
    insertNode({ id: 'node-1', tier: 'PROJECT', projectId: 'proj-bbr', title: 'BBR Research data pipeline' });
    insertNode({ id: 'node-2', tier: 'PROJECT', projectId: 'proj-bbr', title: 'Unrelated legacy invoicing reconciliation' });

    // A realistic ScopeLogic/Cerebro prompt: a full conversation transcript,
    // never a literal substring of any node title.
    const transcriptQuery = `You are ScopeLogic, an expert workflow architect.
Ask ONE focused clarifying question at a time.

Conversation so far:
User: I want to build a workflow around our BBR Research data pipeline docs.
ScopeLogic: What data sources does it need to process?
User: Just the existing BBR pipeline outputs.

ScopeLogic:`;

    const results = OKFGraphQuery.searchNodes({ keyword: transcriptQuery, projectId: 'proj-bbr' });

    expect(results.map(r => r.id)).toContain('node-1');
    expect(results.map(r => r.id)).not.toContain('node-2');
  });

  it('still matches a short literal keyword (single short token) directly', () => {
    insertNode({ id: 'node-3', tier: 'GLOBAL', projectId: null, title: 'Redaction Policy' });

    const results = OKFGraphQuery.searchNodes({ keyword: 'Redaction' });

    expect(results.map(r => r.id)).toContain('node-3');
  });

  it('never returns another project\'s PROJECT-tier node', () => {
    insertNode({ id: 'node-4', tier: 'PROJECT', projectId: 'proj-a', title: 'Alpha pipeline configuration' });
    insertNode({ id: 'node-5', tier: 'PROJECT', projectId: 'proj-b', title: 'Alpha pipeline configuration' });

    const results = OKFGraphQuery.searchNodes({ keyword: 'Tell me about the alpha pipeline configuration setup', projectId: 'proj-a' });

    expect(results.map(r => r.id)).toContain('node-4');
    expect(results.map(r => r.id)).not.toContain('node-5');
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ScopeLogicSession, GenerateFn } from './interview';
import { RouteSwitchEngine } from '../routeswitch/engine';
import { LLMProvider } from '../routeswitch/providers';
import { db, initDB } from '../basevault/db';

// This reproduces the exact user-reported bug: a ScopeLogic interview for a
// real project answering "I cannot access external files... my understanding
// comes solely from this conversation" even though the project has relevant
// OKF content indexed. It wires the same chokepoint production code uses
// (server/index.ts's generateFn -> RouteSwitchEngine.execute ->
// OKFGraphQuery.resolveContext) and asserts the project's OKF node content
// actually reaches the final prompt handed to the LLM provider.
describe('ScopeLogic interview — project-scoped OKF context reaches the LLM prompt', () => {
  it('injects the active project\'s OKF node content into the prompt sent to the provider', async () => {
    initDB();
    const projectId = 'proj-e2e-bbr';
    db.prepare('DELETE FROM okf_nodes').run();
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    db.prepare(`INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`).run(projectId, 'BBR Research', Date.now());

    const tmpFile = path.join(os.tmpdir(), `okf-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
    const marker = 'ZZBBR_UNIQUE_PIPELINE_FACT_9F3';
    fs.writeFileSync(tmpFile, `---\ntitle: BBR Pipeline\n---\n${marker}: the BBR pipeline ingests quarterly filings.`);

    db.prepare(`
      INSERT INTO okf_nodes (id, tier, project_id, type, title, confidence, file_path, last_indexed_at)
      VALUES (?, 'PROJECT', ?, 'decision', ?, 1.0, ?, ?)
    `).run('node-e2e-bbr', projectId, 'BBR Pipeline', tmpFile, Date.now());

    try {
      // Capture the exact prompt the provider receives, instead of relying on
      // MockProvider's truncated echo — this is the real assertion surface.
      let capturedPrompt = '';
      const capturingProvider: LLMProvider = {
        id: 'capture',
        async generate(prompt: string) {
          capturedPrompt = prompt;
          return '{"done":true}';
        },
      };

      const engine = new RouteSwitchEngine();
      engine.setProvider(capturingProvider);

      // Mirrors server/index.ts's generateFn wiring exactly.
      const generateFn: GenerateFn = async (prompt: string, schema?: any, pid?: string) => {
        const result = await engine.execute({
          prompt, estimatedTokens: 200, scope: 'agent', scopeId: 'scopelogic-interview', responseSchema: schema,
          ...(pid !== undefined ? { projectId: pid } : {}),
        });
        return result.content;
      };

      const session = new ScopeLogicSession(generateFn);
      await session.processUserInputAsync(
        'I want a workflow for our BBR Research data pipeline docs.',
        projectId,
      );

      expect(capturedPrompt).toContain(marker);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

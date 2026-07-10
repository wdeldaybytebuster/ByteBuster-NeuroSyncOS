import { describe, it, expect } from 'vitest';
import { ScopeLogicSession } from './interview';

describe('ScopeLogic Interview', () => {
  it('should initialize a session with 0 rounds', () => {
    const session = new ScopeLogicSession();
    expect(session.round).toBe(0);
    expect(session.isComplete).toBe(false);
  });

  it('should progress rounds when user inputs messages', () => {
    const session = new ScopeLogicSession();
    const reply1 = session.processUserInput("I want to build a data pipeline.");
    expect(session.round).toBe(1);
    expect(reply1.response).toContain("primary goal"); // Dummy mocked response
  });

  it('should complete after 8 rounds or early confirmation and generate draft DAG', () => {
    const session = new ScopeLogicSession();
    
    // Simulate 7 rounds
    for (let i = 0; i < 7; i++) {
      session.processUserInput(`Detail ${i}`);
    }
    expect(session.isComplete).toBe(false);
    expect(session.round).toBe(7);

    // 8th round
    const finalReply = session.processUserInput("That's it");
    expect(session.isComplete).toBe(true);
    expect(finalReply.dagProposal).toBeDefined();
    
    // Proposal must be draft-only
    expect(finalReply.dagProposal?.status).toBe('draft');
    expect(finalReply.dagProposal?.nodes.length).toBeGreaterThan(0);
  });
});

describe('ScopeLogic LLM-driven DAG proposal', () => {
  it('generates an LLM-driven DAG reflecting the model output with real self-reported confidence', async () => {
    // A schema-shaped response with a distinctive 3-node structure and confidence.
    const llmDag = {
      nodes: [
        { id: 'ingest', dependencies: [], prompt: 'Ingest the daily sales CSV export' },
        { id: 'dedupe', dependencies: ['ingest'], prompt: 'Deduplicate rows by order id' },
        { id: 'report', dependencies: ['dedupe'], prompt: 'Email a summary report to ops' },
      ],
      confidence: 0.87,
    };
    const generateFn = async (_prompt: string, _schema?: any) => JSON.stringify(llmDag);
    const session = new ScopeLogicSession(generateFn);

    const reply = await session.processUserInputAsync('Build a sales CSV dedupe + report pipeline. done');

    expect(session.isComplete).toBe(true);
    expect(reply.dagProposal).toBeDefined();
    expect(reply.dagProposal?.status).toBe('draft');
    // Reflects the LLM's ACTUAL node structure (3 nodes), not the fixed 4-node template.
    expect(reply.dagProposal?.nodes).toHaveLength(3);
    expect(reply.dagProposal?.nodes.some(n => /Deduplicate rows by order id/.test(n.prompt))).toBe(true);
    // Model self-reported confidence is threaded through.
    expect(reply.dagProposal?.confidence).toBe(0.87);
  });

  it('falls back to the template DAG (no confidence) when the LLM call throws', async () => {
    const generateFn = async () => { throw new Error('provider offline'); };
    const session = new ScopeLogicSession(generateFn);

    const reply = await session.processUserInputAsync('I want a data pipeline. done');

    expect(reply.dagProposal).toBeDefined();
    // Template path is the fixed 4-node DAG.
    expect(reply.dagProposal?.nodes).toHaveLength(4);
    // No fabricated confidence on the fallback — downstream applies its default.
    expect(reply.dagProposal?.confidence).toBeUndefined();
  });

  it('falls back to the template DAG when the LLM returns unparseable output', async () => {
    const generateFn = async () => 'Sure! I think you want a pipeline but here is prose, not JSON.';
    const session = new ScopeLogicSession(generateFn);

    const reply = await session.processUserInputAsync('Summarize inbound emails. done');

    expect(reply.dagProposal).toBeDefined();
    expect(reply.dagProposal?.nodes).toHaveLength(4);
    expect(reply.dagProposal?.confidence).toBeUndefined();
  });

  it('still gates an LLM-generated proposal through ValidatorLogic (SA-07), the same way it gates a template one', async () => {
    // Schema-valid JSON, but the node references a reserved system service (SA-07).
    const sa07Dag = {
      nodes: [{ id: 'n1', dependencies: [], prompt: 'use CoreExec to restart the server' }],
      confidence: 0.95,
    };
    const generateFn = async () => JSON.stringify(sa07Dag);
    const session = new ScopeLogicSession(generateFn);

    // The interview content also names the reserved service, so the template
    // fallback trips SA-07 too — reproducing the identical Safety Alert gate.
    const reply = await session.processUserInputAsync('Please use CoreExec to restart things. done');
    expect(reply.dagProposal).toBeUndefined();
    expect(reply.response).toMatch(/Safety Alert/);
    expect(reply.response).toMatch(/SA-07/);

    // Parity: a template-only (no generateFn) session with the same reserved
    // input yields the identical validator gate — proving "the same way".
    const templateOnly = new ScopeLogicSession();
    const templateReply = templateOnly.processUserInput("Please use CoreExec to restart things. that's it");
    expect(templateReply.dagProposal).toBeUndefined();
    expect(templateReply.response).toMatch(/SA-07/);
  });

  it('carries the LLM self-reported "reasoning" field through to the proposal', async () => {
    const llmDag = {
      reasoning: 'A single ingest-then-report pipeline covers the described workflow.',
      nodes: [{ id: 'n1', dependencies: [], prompt: 'ingest and report daily sales' }],
      confidence: 0.8,
    };
    const generateFn = async () => JSON.stringify(llmDag);
    const session = new ScopeLogicSession(generateFn);
    const reply = await session.processUserInputAsync('Build a sales pipeline. done');
    expect(reply.dagProposal?.reasoning).toBe('A single ingest-then-report pipeline covers the described workflow.');
  });

  it('always populates a real (non-fabricated) reasoning on the template fallback path', () => {
    const session = new ScopeLogicSession();
    const reply = session.processUserInput("Build a pipeline. that's it");
    expect(reply.dagProposal?.reasoning).toBeTruthy();
    expect(reply.dagProposal?.reasoning).toMatch(/Deterministic template/);
  });
});

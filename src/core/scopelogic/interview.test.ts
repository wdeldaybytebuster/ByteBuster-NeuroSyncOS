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

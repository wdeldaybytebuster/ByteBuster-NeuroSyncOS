import { describe, it, expect } from 'vitest';
import { AgentStopSupervisor } from './agent-stop';

describe('AgentStopSupervisor', () => {
  it('should trigger abort if logprob drops below threshold consecutively', () => {
    const supervisor = new AgentStopSupervisor({ thresholdH: -1.0, consecutiveTokens: 3 });
    const abortController = new AbortController();
    let abortCalled = false;
    abortController.signal.addEventListener('abort', () => {
      abortCalled = true;
    });

    // Send two low confidence tokens
    supervisor.evaluateToken(-1.5, abortController);
    supervisor.evaluateToken(-2.0, abortController);
    expect(abortCalled).toBe(false);

    // Third one triggers
    supervisor.evaluateToken(-1.1, abortController);
    expect(abortCalled).toBe(true);
    expect(abortController.signal.reason.message).toMatch(/Preemptive abort triggered/);
  });

  it('should reset counter if a good token arrives', () => {
    const supervisor = new AgentStopSupervisor({ thresholdH: -1.0, consecutiveTokens: 3 });
    const abortController = new AbortController();
    
    supervisor.evaluateToken(-1.5, abortController);
    supervisor.evaluateToken(-2.0, abortController);
    
    // Good token
    supervisor.evaluateToken(-0.5, abortController);
    
    // Now it takes 3 more
    supervisor.evaluateToken(-1.1, abortController);
    supervisor.evaluateToken(-1.1, abortController);
    expect(abortController.signal.aborted).toBe(false);
    
    supervisor.evaluateToken(-1.1, abortController);
    expect(abortController.signal.aborted).toBe(true);
  });
});

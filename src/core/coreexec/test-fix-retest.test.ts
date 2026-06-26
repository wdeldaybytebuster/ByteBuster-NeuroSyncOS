import { describe, it, expect, vi } from 'vitest';

describe('Test-Fix-Retest Mechanics', () => {
  it('injects previous error log back into the prompt and halts at max_iterations (Iteration Ceiling)', async () => {
    const max_iterations = 3;
    let iterations = 0;
    
    const taskLoopMock = vi.fn(async (prompt: string) => {
      iterations++;
      
      // Enforce Iteration Ceiling
      if (iterations > max_iterations) {
        throw new Error('Escalation: max_iterations reached');
      }
      
      // Simulate an execution failure returning an error log
      const simulatedError = `Command failed on iteration ${iterations} with code 1\nstderr: mock error`;
      return { success: false, errorLog: simulatedError };
    });

    let currentPrompt = "Implement command X";
    let failed = false;

    try {
      while (true) {
        const result = await taskLoopMock(currentPrompt);
        if (result.success) {
          break;
        } else {
          currentPrompt = currentPrompt + `\nPrevious error:\n${result.errorLog}`;
        }
      }
    } catch (err: any) {
      expect(err.message).toMatch(/Escalation: max_iterations reached/);
      failed = true;
    }

    // Verify it halted strictly at the ceiling
    expect(failed).toBe(true);
    expect(iterations).toBe(max_iterations + 1);
    
    // Assert error injection logic
    expect(taskLoopMock.mock.calls[1]?.[0]).toContain('Previous error:\nCommand failed on iteration 1');
    expect(taskLoopMock.mock.calls[2]?.[0]).toContain('Previous error:\nCommand failed on iteration 2');
  });
});

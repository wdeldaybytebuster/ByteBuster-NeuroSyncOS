export interface LogprobSupervisorConfig {
  thresholdH: number;
  consecutiveTokens?: number;
}

export class AgentStopSupervisor {
  private config: LogprobSupervisorConfig;
  private consecutiveLowCount: number = 0;

  constructor(config: LogprobSupervisorConfig = { thresholdH: -1.0, consecutiveTokens: 3 }) {
    this.config = config;
  }

  /**
   * Evaluates a token's logprob.
   * If confidence drops below threshold H for enough consecutive tokens,
   * it triggers the provided abort controller.
   */
  public evaluateToken(logprob: number, abortController: AbortController): void {
    if (logprob < this.config.thresholdH) {
      this.consecutiveLowCount++;
      const limit = this.config.consecutiveTokens ?? 3;
      if (this.consecutiveLowCount >= limit) {
        abortController.abort(new Error(`AgentStop: Preemptive abort triggered (confidence dropped below threshold H)`));
      }
    } else {
      this.consecutiveLowCount = 0;
    }
  }

  public reset(): void {
    this.consecutiveLowCount = 0;
  }
}

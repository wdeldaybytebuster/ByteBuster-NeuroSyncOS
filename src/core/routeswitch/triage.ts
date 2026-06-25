export class TriageClassifier {
  private static HIGH_RISK_KEYWORDS = [
    'delete', 'drop', 'remove', 'destroy',
    'database', 'credentials', 'password', 'secret', 'token',
    'admin', 'root', 'sudo', 'format', 'truncate'
  ];

  /**
   * Determines if a query is high-risk based on keywords.
   * High-risk queries should trigger Council Mode for consensus checking.
   */
  public static isHighRisk(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();
    for (const keyword of this.HIGH_RISK_KEYWORDS) {
      if (lowerPrompt.includes(keyword)) {
        return true;
      }
    }
    return false;
  }
}

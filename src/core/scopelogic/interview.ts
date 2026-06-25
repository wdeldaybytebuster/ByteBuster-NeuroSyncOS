import crypto from 'crypto';
import { ValidatorLogic } from './validator';

export interface InterviewMessage {
  role: 'user' | 'system';
  content: string;
  timestamp: number;
}

export interface DAGProposal {
  id: string;
  status: 'draft';
  nodes: { id: string; dependencies: string[]; prompt: string }[];
}

export interface InterviewResponse {
  response: string;
  dagProposal?: DAGProposal;
}

// Optional LLM generator function injected at construction time
export type GenerateFn = (prompt: string) => Promise<string>;

const SYSTEM_PROMPT = `You are ScopeLogic, an expert workflow architect.
Your job is to conduct a concise requirements-gathering interview to understand what automated workflow the user wants to build.
Ask ONE focused clarifying question at a time. Be direct and brief.
Once you have enough information (after 3-8 exchanges), output EXACTLY this JSON on its own line: {"done":true}
Do not include any other JSON. Do not explain the JSON.`;

export class ScopeLogicSession {
  public round: number = 0;
  public isComplete: boolean = false;
  private history: InterviewMessage[] = [];
  private readonly MAX_ROUNDS = 8;
  private generateFn: GenerateFn | null;

  constructor(generateFn?: GenerateFn) {
    this.generateFn = generateFn || null;
  }

  public async processUserInputAsync(input: string): Promise<InterviewResponse> {
    if (this.isComplete) {
      throw new Error('Interview is already complete. Cannot accept more input.');
    }

    this.history.push({ role: 'user', content: input, timestamp: Date.now() });
    this.round++;

    // Check early completion triggers
    const forceComplete = this.round >= this.MAX_ROUNDS
      || input.toLowerCase().includes('looks good')
      || input.toLowerCase().includes("that's it")
      || input.toLowerCase().includes('done');

    if (forceComplete) {
      return this._generateProposal();
    }

    // Try LLM-generated question
    if (this.generateFn) {
      try {
        const conversationContext = this.history
          .map(m => `${m.role === 'user' ? 'User' : 'ScopeLogic'}: ${m.content}`)
          .join('\n');

        const llmPrompt = `${SYSTEM_PROMPT}\n\nConversation so far:\n${conversationContext}\n\nScopeLogic:`;
        const rawResponse = await this.generateFn(llmPrompt);

        // Check if LLM signals completion
        if (rawResponse.includes('"done":true')) {
          return this._generateProposal();
        }

        const systemResponse = rawResponse.trim();
        this.history.push({ role: 'system', content: systemResponse, timestamp: Date.now() });
        return { response: systemResponse };
      } catch (err: any) {
        // Fall through to static questions on LLM error
        console.warn('ScopeLogic LLM call failed, using static fallback:', err.message);
      }
    }

    // Static fallback questions (offline / no provider)
    const staticQuestions = [
      'What is the primary goal of this workflow?',
      'What data sources or inputs does it need to process?',
      'What should the final output look like?',
      'Are there any external APIs or services it should call?',
      'How often should this workflow run — on demand, scheduled, or triggered?',
      'Who are the end users of this workflow?',
      'Are there any constraints — budget, latency, privacy requirements?',
    ];
    const question = staticQuestions[Math.min(this.round - 1, staticQuestions.length - 1)] || 'Can you provide more details?';
    this.history.push({ role: 'system', content: question, timestamp: Date.now() });
    return { response: question };
  }

  /** Synchronous fallback for server routes that can't await (legacy) */
  public processUserInput(input: string): InterviewResponse {
    if (this.isComplete) {
      throw new Error('Interview is already complete. Cannot accept more input.');
    }

    this.history.push({ role: 'user', content: input, timestamp: Date.now() });
    this.round++;

    const forceComplete = this.round >= this.MAX_ROUNDS
      || input.toLowerCase().includes('looks good')
      || input.toLowerCase().includes("that's it");

    if (forceComplete) {
      return this._generateProposal();
    }

    const staticQuestions = [
      'What is the primary goal of this workflow?',
      'What data sources or inputs does it need to process?',
      'What should the final output look like?',
      'Are there any external APIs or services it should call?',
      'How often should this workflow run?',
      'Who are the end users of this workflow?',
      'Are there any constraints — budget, latency, privacy?',
    ];
    const question = staticQuestions[Math.min(this.round - 1, staticQuestions.length - 1)] || 'Can you provide more details?';
    this.history.push({ role: 'system', content: question, timestamp: Date.now() });
    return { response: question };
  }

  private _generateProposal(): InterviewResponse {
    this.isComplete = true;

    // Extract meaningful node labels from user messages
    const userMessages = this.history.filter(m => m.role === 'user').map(m => m.content);

    const nodePrompts = [
      `Parse and validate input: ${userMessages[0]?.substring(0, 50) || 'user request'}`,
      `Fetch required data based on: ${userMessages[1]?.substring(0, 50) || 'data sources'}`,
      `Process and transform data`,
      `Generate final output`,
    ];

    const nodeIds = nodePrompts.map(() => crypto.randomUUID());

    const proposal: DAGProposal = {
      id: crypto.randomUUID(),
      status: 'draft',
      nodes: nodePrompts.map((prompt, i) => ({
        id: nodeIds[i]!,
        dependencies: i > 0 ? [nodeIds[i - 1]!] : [],
        prompt,
      })),
    };

    const validationError = ValidatorLogic.validate(proposal);

    if (validationError) {
      return {
        response: `Safety Alert: I cannot generate this workflow. ${validationError} Please rephrase your requirements to avoid destructive commands or unauthorized agents.`,
      };
    }

    return {
      response: 'I have gathered enough requirements. Here is your draft workflow — review it on the canvas.',
      dagProposal: proposal,
    };
  }

  public getHistory(): InterviewMessage[] {
    return [...this.history];
  }

  public reset(): void {
    this.round = 0;
    this.isComplete = false;
    this.history = [];
  }
}

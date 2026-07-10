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
  /**
   * Model self-reported confidence (0.0-1.0) that the DAG captures the user's
   * intent. Present ONLY on the LLM-driven generation path; left undefined on
   * the template fallback so downstream (system.ts /proposals/stage) applies its
   * conservative DEFAULT_PROPOSAL_CONFIDENCE instead of a fabricated number.
   */
  confidence?: number;
  /**
   * Brief rationale for why this DAG structure fulfills the request. Always
   * populated on BOTH the LLM path (requested via DAG_PROPOSAL_SCHEMA below)
   * and the deterministic template fallback (_generateTemplateProposal), so
   * enabling the QR-01 "Reasoning key present" Behavioral Assertion
   * (validator.ts) never breaks a real generation path — it only rejects
   * proposals a caller crafted by hand (e.g. a raw dag_template written
   * directly into SQLite) without one.
   */
  reasoning?: string;
}

export interface InterviewResponse {
  response: string;
  dagProposal?: DAGProposal;
}

// Optional LLM generator function injected at construction time. The optional
// `schema` param mirrors OKF's generator signature (core/okf/generator.ts): a
// JSON-schema hint that triggers grammar-constrained / response_format decoding
// on schema-capable providers.
export type GenerateFn = (prompt: string, schema?: any, projectId?: string) => Promise<string>;

const SYSTEM_PROMPT = `You are ScopeLogic, an expert workflow architect.
Your job is to conduct a concise requirements-gathering interview to understand what automated workflow the user wants to build.
Ask ONE focused clarifying question at a time. Be direct and brief.
Once you have enough information (after 3-8 exchanges), output EXACTLY this JSON on its own line: {"done":true}
Do not include any other JSON. Do not explain the JSON.`;

/**
 * JSON-schema hint for LLM-driven DAG proposal generation. Modeled on OKF's
 * concept-extraction schema (core/okf/generator.ts): passed as the second arg
 * to `generateFn`, it drives structured output on schema-capable providers
 * (OpenAI `response_format`, llama.cpp GBNF). The model must self-report a
 * `confidence` field, exactly as OKF requires per extracted concept.
 *
 * Design note — plain JSON-schema hint, NOT a hand-written GBNF grammar: OKF
 * keeps a GBNF grammar (OKF_CONCEPT_EXTRACTION_GBNF) for its flat concept array,
 * but the value it actually feeds `generateFn` is this JSON-schema object, and
 * the responseSchema plumbing already routes it to schema-capable providers. A
 * DAG is a variable-length node list with nested dependency arrays and free-text
 * prompts; a correct GBNF for that is materially more complex and error-prone
 * than the flat-array grammar, for no additional guarantee on providers that
 * only honor JSON-schema. So we reuse the proven JSON-schema path and keep the
 * ValidatorLogic gate + template fallback as the real safety net.
 */
const DAG_PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: { type: 'string' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } },
          prompt: { type: 'string' },
        },
        required: ['id', 'dependencies', 'prompt'],
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['reasoning', 'nodes', 'confidence'],
};

export class ScopeLogicSession {
  public round: number = 0;
  public isComplete: boolean = false;
  private history: InterviewMessage[] = [];
  private readonly MAX_ROUNDS = 8;
  private generateFn: GenerateFn | null;

  constructor(generateFn?: GenerateFn) {
    this.generateFn = generateFn || null;
  }

  public async processUserInputAsync(input: string, projectId?: string): Promise<InterviewResponse> {
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
      return this._generateProposal(projectId);
    }

    // Try LLM-generated question
    if (this.generateFn) {
      try {
        const conversationContext = this.history
          .map(m => `${m.role === 'user' ? 'User' : 'ScopeLogic'}: ${m.content}`)
          .join('\n');

        const llmPrompt = `${SYSTEM_PROMPT}\n\nConversation so far:\n${conversationContext}\n\nScopeLogic:`;
        const rawResponse = await this.generateFn(llmPrompt, undefined, projectId);

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
      // Legacy sync path can't await the LLM, so it uses the deterministic
      // template generator directly — same behavior this method always had.
      return this._generateTemplateProposal();
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

  /**
   * LLM-driven DAG proposal generation with graceful degradation.
   *
   * Primary path: prompt the model with the full interview transcript and a
   * DAG_PROPOSAL_SCHEMA hint (mirroring OKF's generator), parse the JSON, run
   * the SAME ValidatorLogic.validate() safety gate the template path uses, and
   * carry the model's self-reported confidence through.
   *
   * Fallback path (any of: no generateFn / LLM throws / unparseable JSON /
   * ValidatorLogic rejects the LLM proposal): delegate to the deterministic
   * template generator, which itself re-runs the validator and returns a Safety
   * Alert if even the template violates a Category-A constraint. This mirrors
   * how conversational Q&A already falls back to static questions — DAG
   * generation is never less resilient than the conversation that produced it.
   */
  private async _generateProposal(projectId?: string): Promise<InterviewResponse> {
    this.isComplete = true;

    if (this.generateFn) {
      try {
        const conversationContext = this.history
          .map(m => `${m.role === 'user' ? 'User' : 'ScopeLogic'}: ${m.content}`)
          .join('\n');

        const dagPrompt = `You are ScopeLogic, an expert workflow architect. The requirements-gathering interview below is complete. Design a concrete workflow DAG that fulfills what the user ACTUALLY described — not a generic template.

Output ONLY a single JSON object of this exact shape:
{"reasoning":"<1-2 sentence rationale for this DAG structure>","nodes":[{"id":"<unique-id>","dependencies":["<id-of-prerequisite-node>"],"prompt":"<what this step does>"}],"confidence":<0.0-1.0>}

Rules:
- Each node is one atomic step. "dependencies" lists the ids of nodes that must run first (use an empty array for entry nodes).
- Tailor nodes and their wiring to the SPECIFIC requirements discussed in the transcript.
- Do NOT reference internal system services (ScopeLogic, BaseVault, RouteSwitch, CoreExec, ScoutDaemon, PortGrid, Cerebro) as nodes.
- Do NOT emit destructive SQL (INSERT/UPDATE/DELETE/DROP/...) or shell/exec commands.
- "reasoning" is a brief rationale for why this structure fulfills what the user described.
- "confidence" is YOUR self-assessed 0.0-1.0 certainty that this DAG correctly captures the user's intent.

Interview transcript:
${conversationContext}`;

        const raw = await this.generateFn(dagPrompt, DAG_PROPOSAL_SCHEMA, projectId);
        const proposal = this._parseLLMProposal(raw);

        if (proposal && ValidatorLogic.validate(proposal) === null) {
          return {
            response: 'I have gathered enough requirements. Here is your draft workflow — review it on the canvas.',
            dagProposal: proposal,
          };
        }
        // Parsed-but-invalid, or unparseable: fall through to the template gate.
      } catch (err: any) {
        console.warn('ScopeLogic DAG LLM generation failed, using template fallback:', err?.message || err);
      }
    }

    return this._generateTemplateProposal();
  }

  /**
   * Parse a raw LLM response into a DAGProposal, robustly (LLMs wrap JSON in
   * markdown fences / add preamble). Mirrors OKF generator's extraction. Returns
   * null when the response can't be coerced into a well-formed node list; the
   * caller then falls back to the template path.
   */
  private _parseLLMProposal(raw: string): DAGProposal | null {
    try {
      let jsonStr = raw.trim();

      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1]!.trim();

      const objStart = jsonStr.indexOf('{');
      const objEnd = jsonStr.lastIndexOf('}');
      if (objStart !== -1 && objEnd > objStart) {
        jsonStr = jsonStr.substring(objStart, objEnd + 1);
      }

      const parsed: any = JSON.parse(jsonStr);
      if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
        return null;
      }

      // Normalize each node into the strict DAGProposal shape. Bad-shaped nodes
      // are dropped; if nothing survives, treat it as unparseable.
      const nodes = parsed.nodes
        .filter((n: any) => n && typeof n === 'object' && typeof n.prompt === 'string' && n.prompt.trim() !== '')
        .map((n: any) => ({
          id: typeof n.id === 'string' && n.id.trim() !== '' ? n.id : crypto.randomUUID(),
          dependencies: Array.isArray(n.dependencies)
            ? n.dependencies.filter((d: any) => typeof d === 'string')
            : [],
          prompt: n.prompt,
        }));

      if (nodes.length === 0) return null;

      const confidence =
        typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
          ? parsed.confidence
          : undefined;

      const reasoning =
        typeof parsed.reasoning === 'string' && parsed.reasoning.trim() !== ''
          ? parsed.reasoning.trim()
          : undefined;

      return {
        id: crypto.randomUUID(),
        status: 'draft',
        nodes,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(reasoning !== undefined ? { reasoning } : {}),
      };
    } catch {
      return null;
    }
  }

  /**
   * Deterministic template-based DAG generator (the original, pre-LLM behavior).
   * Retained as the fallback path AND as the generator the legacy sync
   * `processUserInput` uses. No `confidence` field — the template has no real
   * model-confidence signal, so downstream applies its conservative default.
   */
  private _generateTemplateProposal(): InterviewResponse {
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
      // Deterministic, honest rationale — no model-authored reasoning exists
      // on this path (no LLM configured, or the LLM path failed/was
      // rejected), so this states exactly what actually happened rather than
      // fabricating a model-sounding explanation. Keeps QR-01 enforceable
      // on this path too instead of only ever passing on the LLM path.
      reasoning: `Deterministic template assembled ${nodePrompts.length} sequential steps from the interview transcript (no LLM provider configured, or the LLM-driven path failed/was rejected by the safety validator).`,
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

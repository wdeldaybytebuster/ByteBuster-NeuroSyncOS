import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { OKFDirectoryManager } from './directory-manager';
import { OKFIndexer } from './indexer';

export interface ExtractedConcept {
  type: string;
  title: string;
  description: string;
  confidence: number;
  tags: string[];
  relatedConcepts: string[];
}

/**
 * GBNF Grammar for OKF Concept Extraction.
 * 
 * This grammar FORCES the local GGUF model to output a valid JSON array of concepts.
 * When passed to node-llama-cpp's createGrammar(), it constrains token generation at
 * the logit level — the model CANNOT produce malformed output. This is the guardrail
 * that eliminates "best-effort" parsing of local model output.
 * 
 * Grammar enforces: [{"type":"...", "title":"...", "description":"...", "confidence":0.XX, "tags":["..."], "relatedConcepts":["..."]}]
 */
export const OKF_CONCEPT_EXTRACTION_GBNF = `
root ::= "[" ws concept-list ws "]"
concept-list ::= concept ("," ws concept)*
concept ::= "{" ws
  "\\"type\\"" ws ":" ws string "," ws
  "\\"title\\"" ws ":" ws string "," ws
  "\\"description\\"" ws ":" ws string "," ws
  "\\"confidence\\"" ws ":" ws number "," ws
  "\\"tags\\"" ws ":" ws string-array "," ws
  "\\"relatedConcepts\\"" ws ":" ws string-array
  ws "}"
string-array ::= "[" ws "]" | "[" ws string ("," ws string)* ws "]"
string ::= "\\"" ([^"\\\\] | "\\\\" .)* "\\""
number ::= "0." [0-9] [0-9]? | "1" (".0" | ".00")?
ws ::= [ \\t\\n]*
`.trim();

/**
 * Generates OKF Markdown files from various input sources.
 * Uses LLM with grammar-constrained decoding for concept extraction.
 */
export class OKFGenerator {

  /**
   * Generate OKF files from a raw document (PDF text, wiki page, etc).
   * Step 1: Extract concepts via grammar-constrained LLM
   * Step 2: Generate Markdown files with YAML frontmatter
   * Step 3: Write to the appropriate OKF directory
   * Step 4: Trigger indexing
   * 
   * @param generateFn LLM generation function (should support responseSchema or grammar)
   * @param documentText The raw text to process
   * @param tier Target tier for the generated files
   * @param projectId Project ID (required for PROJECT tier)
   * @returns Paths of generated files
   */
  public static async fromDocument(
    generateFn: (prompt: string, schema?: any) => Promise<string>,
    documentText: string,
    tier: 'USER' | 'PROJECT',
    projectId?: string
  ): Promise<string[]> {
    // Step 1: Extract concepts
    const concepts = await this._extractConcepts(generateFn, documentText);

    // Step 2+3: Generate and write Markdown files
    const dir = tier === 'PROJECT' && projectId
      ? OKFDirectoryManager.resolveProjectDir(projectId)
      : OKFDirectoryManager.resolveUserDir();

    if (!dir) return [];

    const writtenPaths = this._writeConcepts(concepts, dir);

    // Step 4: Trigger indexing for the directory
    if (tier === 'PROJECT' && projectId) {
      OKFIndexer.indexDirectory(dir, 'PROJECT', projectId);
    } else {
      OKFIndexer.indexDirectory(dir, 'USER', null);
    }

    return writtenPaths;
  }

  /**
   * Generate OKF file from a Cerebro chat transcript.
   * Extracts operator preferences and decisions.
   */
  public static async fromChat(
    generateFn: (prompt: string, schema?: any) => Promise<string>,
    chatHistory: string[],
    tier: 'USER' | 'PROJECT' = 'USER',
    projectId?: string
  ): Promise<string[]> {
    const transcript = chatHistory.join('\n');

    const prompt = `Extract operator preferences, decisions, and rules from this chat transcript.
Each concept should be a single atomic fact (one preference, one rule, one decision).
Output as a JSON array of concepts.

Transcript:
${transcript.substring(0, 3000)}`;

    const concepts = await this._extractConcepts(generateFn, prompt);

    const dir = tier === 'PROJECT' && projectId
      ? OKFDirectoryManager.resolveProjectDir(projectId)
      : OKFDirectoryManager.resolveUserDir();

    if (!dir) return [];

    const writtenPaths = this._writeConcepts(concepts, dir);

    if (tier === 'PROJECT' && projectId) {
      OKFIndexer.indexDirectory(dir, 'PROJECT', projectId);
    } else {
      OKFIndexer.indexDirectory(dir, 'USER', null);
    }

    return writtenPaths;
  }

  /**
   * Generate OKF "runbook" file from a successful workflow execution.
   * Captures what was built and how it functions.
   */
  public static async fromWorkflowRun(
    generateFn: (prompt: string, schema?: any) => Promise<string>,
    runId: string,
    taskOutputs: { prompt: string; output: string }[],
    projectId: string
  ): Promise<string[]> {
    const summary = taskOutputs.map((t, i) => `Step ${i + 1}: ${t.prompt}\nOutput: ${t.output}`).join('\n\n');

    const prompt = `Summarize this completed workflow into reusable knowledge concepts.
Each concept should describe a capability, pattern, or runbook step.
Output as a JSON array of concepts.

Workflow Run:
${summary.substring(0, 3000)}`;

    const concepts = await this._extractConcepts(generateFn, prompt);

    const dir = OKFDirectoryManager.resolveProjectDir(projectId);
    if (!dir) return [];

    const writtenPaths = this._writeConcepts(concepts, dir);
    OKFIndexer.indexDirectory(dir, 'PROJECT', projectId);

    return writtenPaths;
  }

  /**
   * Extract concepts from text using LLM with grammar constraints.
   * The responseSchema triggers grammar-constrained decoding on compatible providers.
   */
  private static async _extractConcepts(
    generateFn: (prompt: string, schema?: any) => Promise<string>,
    inputText: string
  ): Promise<ExtractedConcept[]> {
    const extractionPrompt = `You are a knowledge extraction engine. Analyze the following text and extract discrete, atomic concepts.
Each concept must have: type (e.g., "preference", "rule", "capability", "metric", "system", "runbook"), title, description, confidence (0.0-1.0), tags, and relatedConcepts.
Output ONLY a valid JSON array. Each item represents one atomic concept.

Text to analyze:
${inputText.substring(0, 4000)}`;

    // The schema hint tells compatible providers (OpenAI, llama.cpp with GBNF) to enforce structure
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          tags: { type: 'array', items: { type: 'string' } },
          relatedConcepts: { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'title', 'description', 'confidence', 'tags', 'relatedConcepts'],
      },
    };

    try {
      const raw = await generateFn(extractionPrompt, schema);

      // LLMs often wrap JSON in markdown fences or add preamble text.
      // Extract the JSON array from the response robustly.
      let jsonStr = raw.trim();

      console.log(`[OKF Generator] Raw LLM response (first 300 chars): ${jsonStr.substring(0, 300)}`);

      // Strip markdown code fences if present
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1]!.trim();
      }

      // Try to find the JSON array boundaries if there's preamble/postamble text
      const arrayStart = jsonStr.indexOf('[');
      const arrayEnd = jsonStr.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd > arrayStart) {
        jsonStr = jsonStr.substring(arrayStart, arrayEnd + 1);
      }

      const parsed: unknown = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (c): c is ExtractedConcept =>
            typeof c === 'object' && c !== null && 'type' in c && 'title' in c && 'description' in c
        );
      }
    } catch (err: any) {
      console.warn('[OKF Generator] Concept extraction failed:', err?.message || err);
      console.warn('[OKF Generator] This usually means the LLM response was not valid JSON. Check the raw response logged above.');
    }

    return [];
  }

  /**
   * Write extracted concepts as OKF Markdown files.
   */
  private static _writeConcepts(concepts: ExtractedConcept[], dir: string): string[] {
    const paths: string[] = [];

    for (const concept of concepts) {
      // Generate filename from title (kebab-case)
      const slug = concept.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 60);

      const filename = `${slug}.md`;
      const filePath = path.join(dir, filename);

      // Don't overwrite existing files (dedup by filename)
      if (fs.existsSync(filePath)) continue;

      // Generate Markdown content with YAML frontmatter
      const relatedLinks = concept.relatedConcepts
        .map(r => {
          const relSlug = r.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          return `- [${r}](./${relSlug}.md)`;
        })
        .join('\n');

      const content = `---
type: ${concept.type}
title: "${concept.title.replace(/"/g, '\\"')}"
confidence: ${concept.confidence.toFixed(2)}
tags: [${concept.tags.map(t => `"${t}"`).join(', ')}]
---

# ${concept.title}

${concept.description}

${relatedLinks ? `## Related Concepts\n\n${relatedLinks}\n` : ''}`;

      fs.writeFileSync(filePath, content, 'utf-8');
      paths.push(filePath);
    }

    // Update manifest
    OKFDirectoryManager.ensureManifestFiles(dir);

    return paths;
  }

  /**
   * Get the GBNF grammar string for use with node-llama-cpp.
   * This is passed to createGrammar() to enforce valid JSON at the token level.
   */
  public static getConceptExtractionGBNF(): string {
    return OKF_CONCEPT_EXTRACTION_GBNF;
  }
}

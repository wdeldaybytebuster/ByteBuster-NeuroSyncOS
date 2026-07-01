import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface OKFFrontmatter {
  type: string;
  title?: string;
  description?: string;
  tags?: string[];
  confidence?: number;
  [key: string]: any;
}

export interface ParsedLink {
  text: string;
  relativePath: string;
  resolvedPath: string;
}

export interface ParsedOKFFile {
  filePath: string;
  frontmatter: OKFFrontmatter;
  frontmatterJson: string;
  links: ParsedLink[];
  contentHash: string;
  body: string;
  isValid: boolean;
  error?: string;
}

/**
 * Parses OKF Markdown files into structured data for graph indexing.
 * 
 * Expected file format:
 * ```
 * ---
 * type: concept
 * title: My Concept
 * confidence: 0.95
 * tags: [database, schema]
 * ---
 * 
 * # Body content here
 * 
 * Related: [Other Concept](./other-concept.md)
 * ```
 */
export class OKFParser {

  /**
   * Parse a single OKF Markdown file.
   * Returns structured data or an error-flagged result (never throws).
   */
  public static parseFile(filePath: string): ParsedOKFFile {
    try {
      if (!fs.existsSync(filePath)) {
        return this._errorResult(filePath, `File not found: ${filePath}`);
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const contentHash = crypto.createHash('sha256').update(raw).digest('hex');

      // Extract YAML frontmatter
      const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        return this._errorResult(filePath, 'No YAML frontmatter found (must start with ---)');
      }

      const yamlBlock = frontmatterMatch[1]!;
      const frontmatter = this._parseYAML(yamlBlock);

      if (!frontmatter.type) {
        return this._errorResult(filePath, 'Missing mandatory "type" field in frontmatter');
      }

      // Normalize confidence to 0.0-1.0 range
      if (frontmatter.confidence !== undefined) {
        frontmatter.confidence = Math.max(0, Math.min(1, Number(frontmatter.confidence) || 0));
      } else {
        frontmatter.confidence = 1.0;
      }

      // Extract body (after frontmatter)
      const body = raw.substring(frontmatterMatch[0].length).trim();

      // Extract relative Markdown links
      const links = this._extractLinks(body, filePath);

      return {
        filePath,
        frontmatter,
        frontmatterJson: JSON.stringify(frontmatter),
        links,
        contentHash,
        body,
        isValid: true,
      };
    } catch (err: any) {
      return this._errorResult(filePath, `Parse error: ${err.message}`);
    }
  }

  /**
   * Simple YAML parser for OKF frontmatter.
   * Handles: key: value, key: [array], key: "quoted string"
   * Does NOT require a full YAML library — OKF frontmatter is intentionally simple.
   */
  private static _parseYAML(yamlBlock: string): OKFFrontmatter {
    const result: Record<string, any> = {};
    const lines = yamlBlock.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.substring(0, colonIdx).trim();
      let value: any = trimmed.substring(colonIdx + 1).trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Parse arrays [item1, item2]
      else if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));
      }
      // Parse numbers
      else if (!isNaN(Number(value)) && value !== '') {
        value = Number(value);
      }
      // Parse booleans
      else if (value === 'true') value = true;
      else if (value === 'false') value = false;

      result[key] = value;
    }

    return result as OKFFrontmatter;
  }

  /**
   * Extract all relative Markdown links from body content.
   * Matches [text](./relative/path.md) and [text](../relative/path.md)
   */
  private static _extractLinks(body: string, sourceFilePath: string): ParsedLink[] {
    const linkRegex = /\[([^\]]+)\]\((\.[^\)]+\.md)\)/g;
    const links: ParsedLink[] = [];
    let match;

    while ((match = linkRegex.exec(body)) !== null) {
      const text = match[1]!;
      const relativePath = match[2]!;
      const sourceDir = path.dirname(sourceFilePath);
      const resolvedPath = path.resolve(sourceDir, relativePath);

      links.push({ text, relativePath, resolvedPath });
    }

    return links;
  }

  private static _errorResult(filePath: string, error: string): ParsedOKFFile {
    return {
      filePath,
      frontmatter: { type: 'unknown' },
      frontmatterJson: '{}',
      links: [],
      contentHash: '',
      body: '',
      isValid: false,
      error,
    };
  }
}

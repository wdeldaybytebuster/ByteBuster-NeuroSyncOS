import fs from 'fs';
import path from 'path';
import { OKFDirectoryManager } from './directory-manager';
import { OKFIndexer } from './indexer';
import { log } from '../observability/logger';

/** Repo-shipped seed content for the GLOBAL OKF tier (base-knowledge research, distilled). */
const SEED_SOURCE_DIR = path.resolve(__dirname, '../../../resources/global_okf_seed');

export interface SeedResult {
  seeded: boolean;
  filesCopied: number;
  indexed: number;
}

/**
 * Recursively copies every .md file from sourceDir into targetDir, preserving
 * subdirectory structure. Pure and testable: takes explicit directories, no
 * dependency on the real home directory.
 */
export function copyMarkdownTree(sourceDir: string, targetDir: string): number {
  if (!fs.existsSync(sourceDir)) return 0;
  let copied = 0;

  const walk = (relDir: string) => {
    const currentSrc = path.join(sourceDir, relDir);
    const entries = fs.readdirSync(currentSrc, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = path.join(relDir, entry.name);
      if (entry.isDirectory()) {
        walk(relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const destPath = path.join(targetDir, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(path.join(sourceDir, relPath), destPath);
        copied++;
      }
    }
  };

  walk('');
  return copied;
}

/**
 * Seeds targetDir from sourceDir only when targetDir currently has zero
 * markdown files. Never overwrites content once an operator (or a previous
 * boot) has populated the tier — this is a first-run bootstrap, not a sync.
 */
export function seedIfEmpty(sourceDir: string, targetDir: string): { seeded: boolean; filesCopied: number } {
  const existing = OKFDirectoryManager.listMarkdownFiles(targetDir);
  if (existing.length > 0) {
    return { seeded: false, filesCopied: 0 };
  }
  const filesCopied = copyMarkdownTree(sourceDir, targetDir);
  return { seeded: filesCopied > 0, filesCopied };
}

/**
 * Called once at server startup. Copies the repo-shipped base-knowledge seed
 * into the real GLOBAL OKF tier on first run and indexes it, so a fresh
 * install ships with real, queryable knowledge instead of an empty directory.
 * No-ops on every subsequent startup once the tier has content.
 *
 * sourceDir/targetDir are overridable for testing so tests never touch the
 * real ~/.neurosync/ directory on the machine running them.
 */
export function bootstrapGlobalOKFSeed(
  sourceDir: string = SEED_SOURCE_DIR,
  targetDir: string = OKFDirectoryManager.resolveGlobalDir(),
): SeedResult {
  const { seeded, filesCopied } = seedIfEmpty(sourceDir, targetDir);
  if (!seeded) {
    return { seeded: false, filesCopied: 0, indexed: 0 };
  }

  const result = OKFIndexer.indexDirectory(targetDir, 'GLOBAL', null);
  log.info(
    `[OKF] Seeded GLOBAL knowledge base: ${filesCopied} files copied, ${result.indexed} indexed, ` +
      `${result.pendingReview} pending review, ${result.rejected} rejected.`,
  );
  if (result.errors.length > 0) {
    log.warn(`[OKF] Seed indexing had ${result.errors.length} error(s):`, result.errors);
  }
  return { seeded: true, filesCopied, indexed: result.indexed };
}

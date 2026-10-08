import { parentPort, isMainThread } from 'worker_threads';
import * as ts from 'typescript';
import { jaroWinkler } from '@skyra/jaro-winkler';

// A simple fallback for jaroWinkler if the dependency isn't available
function jaroWinklerFallback(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  let matching = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) matching++;
  }
  return matching / Math.max(s1.length, s2.length);
}

// Ensure we have a jaroWinkler implementation
const jw = typeof jaroWinkler === 'function' ? jaroWinkler : jaroWinklerFallback;

const STOP_WORDS = new Set(['function', 'const', 'let', 'var', 'class', 'import', 'export', 'default', 'return']);

function filterStopWords(name: string): boolean {
  return !STOP_WORDS.has(name.toLowerCase());
}

function processASTNode(node: ts.Node, symbols: any[]) {
  if (ts.isExportDeclaration(node)) {
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      node.exportClause.elements.forEach(el => {
        if (filterStopWords(el.name.text)) {
          symbols.push({ type: 'export', name: el.name.text });
        }
      });
    }
  } else if (ts.isFunctionDeclaration(node) && node.name) {
    if (filterStopWords(node.name.text)) {
      symbols.push({ type: 'function', name: node.name.text });
    }
  } else if (ts.isClassDeclaration(node) && node.name) {
    if (filterStopWords(node.name.text)) {
      symbols.push({ type: 'class', name: node.name.text });
    }
  } else if (ts.isVariableStatement(node)) {
    node.declarationList.declarations.forEach(decl => {
      if (ts.isIdentifier(decl.name) && filterStopWords(decl.name.text)) {
        symbols.push({ type: 'variable', name: decl.name.text });
      }
    });
  } else if (ts.isImportDeclaration(node)) {
    const moduleSpecifier = node.moduleSpecifier;
    if (ts.isStringLiteral(moduleSpecifier)) {
      symbols.push({ type: 'import', name: moduleSpecifier.text });
    }
  }
  ts.forEachChild(node, child => processASTNode(child, symbols));
}

function deduplicateSymbols(symbols: any[]): any[] {
  const unique: any[] = [];
  for (const sym of symbols) {
    let duplicate = false;
    for (const u of unique) {
      if (sym.type === u.type && jw(sym.name, u.name) > 0.95) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) unique.push(sym);
  }
  return unique;
}

function parseAndReduceAST(sourceCode: string): any[] {
  const sourceFile = ts.createSourceFile('temp.ts', sourceCode, ts.ScriptTarget.Latest, true);
  const rawSymbols: any[] = [];
  processASTNode(sourceFile, rawSymbols);
  return deduplicateSymbols(rawSymbols);
}

if (!isMainThread && parentPort) {
  parentPort.on('message', (msg) => {
    if (msg.type === 'PARSE') {
      try {
        const symbols = parseAndReduceAST(msg.sourceCode);
        
        // Chunked message passing
        const CHUNK_SIZE = 50;
        for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
          const chunk = symbols.slice(i, i + CHUNK_SIZE);
          parentPort?.postMessage({ type: 'CHUNK', payload: chunk });
        }
        
        parentPort?.postMessage({ type: 'DONE' });
      } catch (error: any) {
        parentPort?.postMessage({ type: 'ERROR', payload: error.message });
      }
    }
  });
}

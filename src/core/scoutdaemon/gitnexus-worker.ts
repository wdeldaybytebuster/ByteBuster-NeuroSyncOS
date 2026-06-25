import { parentPort, isMainThread } from 'worker_threads';

interface ASTNode {
  type: string;
  name?: string;
  value?: string;
  children?: ASTNode[];
}

const STOP_WORDS = new Set(['function', 'const', 'let', 'var', 'class', 'import', 'export', 'default', 'return']);

// Mock Jaro-Winkler edit distance for AST reduction and deduplication
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  // Very simplified mock for demonstration
  let matching = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) matching++;
  }
  return matching / Math.max(s1.length, s2.length);
}

function filterStopWords(name: string): boolean {
  return !STOP_WORDS.has(name.toLowerCase());
}

function processASTNode(node: ASTNode, symbols: any[]) {
  if (node.type === 'ExportNamedDeclaration' && node.name && filterStopWords(node.name)) {
    symbols.push({ type: 'export', name: node.name });
  }
  if (node.type === 'ImportDeclaration' && node.name) {
    symbols.push({ type: 'import', name: node.name });
  }
  if (node.children) {
    for (const child of node.children) {
      processASTNode(child, symbols);
    }
  }
}

function deduplicateSymbols(symbols: any[]): any[] {
  const unique = [];
  for (const sym of symbols) {
    let duplicate = false;
    for (const u of unique) {
      if (sym.type === u.type && jaroWinkler(sym.name, u.name) > 0.95) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) unique.push(sym);
  }
  return unique;
}

function parseAndReduceAST(sourceCode: string): any[] {
  // Mocking parsing oxc-parser
  const mockAST: ASTNode = {
    type: 'Program',
    children: [
      { type: 'ImportDeclaration', name: 'worker_threads' },
      { type: 'ExportNamedDeclaration', name: 'MyFunction' },
      { type: 'ExportNamedDeclaration', name: 'MyFunction' }, // Duplicate to test Jaro-Winkler
      { type: 'FunctionDeclaration', name: 'InternalHelper' }
    ]
  };
  
  const rawSymbols: any[] = [];
  processASTNode(mockAST, rawSymbols);
  const reducedSymbols = deduplicateSymbols(rawSymbols);
  
  return reducedSymbols;
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

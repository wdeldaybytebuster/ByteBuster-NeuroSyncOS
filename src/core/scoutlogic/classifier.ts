export function classifyComplexity(prompt: string): 'trivial' | 'logical' | 'complex' {
  const normalizedPrompt = prompt.toLowerCase();
  
  const complexKeywords = ['implement', 'architect', 'debug', 'refactor', 'plan'];
  const logicalKeywords = ['format as json', 'extract', 'summarize'];

  if (complexKeywords.some(kw => normalizedPrompt.includes(kw))) {
    return 'complex';
  }

  if (logicalKeywords.some(kw => normalizedPrompt.includes(kw))) {
    return 'logical';
  }

  if (prompt.length > 300) {
    return 'complex';
  } else if (prompt.length > 50) {
    return 'logical';
  }

  return 'trivial';
}

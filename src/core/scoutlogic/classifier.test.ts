import { describe, it, expect } from 'vitest';
import { classifyComplexity } from './classifier';

describe('classifyComplexity', () => {
  it('categorizes coding/reasoning keywords as complex', () => {
    expect(classifyComplexity('Can you please implement the login function?')).toBe('complex');
    expect(classifyComplexity('We need to architect a new database schema')).toBe('complex');
    expect(classifyComplexity('Help me debug this issue in the backend')).toBe('complex');
    expect(classifyComplexity('Refactor this code to be more readable')).toBe('complex');
    expect(classifyComplexity('Plan the release for the new feature')).toBe('complex');
  });

  it('categorizes formatting/extraction keywords as logical', () => {
    expect(classifyComplexity('Extract the names from this text')).toBe('logical');
    expect(classifyComplexity('Please format as JSON')).toBe('logical');
    expect(classifyComplexity('Summarize the following document for me')).toBe('logical');
  });

  it('categorizes short prompts without keywords as trivial', () => {
    expect(classifyComplexity('Hi')).toBe('trivial');
    expect(classifyComplexity('What is the weather today?')).toBe('trivial');
    expect(classifyComplexity('Tell me a joke')).toBe('trivial');
  });

  it('categorizes medium length prompts without keywords as logical', () => {
    expect(classifyComplexity('This is a medium length prompt that exceeds fifty characters but is not extremely long or complex in nature, so it should be categorized as logical.')).toBe('logical');
  });

  it('categorizes long prompts without keywords as complex', () => {
    const longPrompt = 'A'.repeat(305);
    expect(classifyComplexity(longPrompt)).toBe('complex');
  });
});

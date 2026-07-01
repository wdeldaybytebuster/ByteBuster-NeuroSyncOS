import { selectOptimalModel } from './dynamic-router';
import { describe, it, expect } from 'vitest';

describe('selectOptimalModel', () => {
  const models = [
    { id: 'gpt-4o' },
    { id: 'claude-3-5-sonnet' },
    { id: 'llama3-70b' },
    { id: 'mixtral-8x7b' },
    { id: 'gpt-3.5-turbo' }
  ];

  it('selects a flagship model when priority is intelligence', () => {
    const result = selectOptimalModel('trivial', 'intelligence', models, []);
    expect(['gpt-4o', 'claude-3-5-sonnet']).toContain(result);
  });

  it('selects a flagship model when complexity is complex', () => {
    const result = selectOptimalModel('complex', 'speed', models, []);
    expect(['gpt-4o', 'claude-3-5-sonnet']).toContain(result);
  });

  it('selects highest tps model when priority is speed and complexity is trivial', () => {
    const benchmarks = [
      { model_id: 'gpt-3.5-turbo', avg_tps: 50 },
      { model_id: 'llama3-70b', avg_tps: 150 }
    ];
    const result = selectOptimalModel('trivial', 'speed', models, benchmarks);
    expect(result).toBe('llama3-70b');
  });

  it('falls back to known fast model if no benchmarks are provided for speed/trivial', () => {
    const result = selectOptimalModel('trivial', 'speed', models, []);
    expect(['llama3-70b', 'mixtral-8x7b']).toContain(result);
  });
  
  it('weights high context limits properly', () => {
    const contextModels = [
       { id: 'unknown-model-1', context_limit: 8000 },
       { id: 'unknown-model-2', context_limit: 128000 }
    ];
    const result = selectOptimalModel('complex', 'intelligence', contextModels, []);
    expect(result).toBe('unknown-model-2');
  });
});

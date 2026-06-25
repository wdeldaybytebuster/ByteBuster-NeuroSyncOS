import { describe, it, expect } from 'vitest';
import { DAGProposalSchema, InterviewResponseSchema } from './schemas';

describe('Rationale-First Schemas', () => {
  it('DAGProposalSchema requires reasoning as the first key to prevent Expert Collapse', () => {
    const keys = Object.keys(DAGProposalSchema.shape);
    expect(keys[0]).toBe('reasoning');
    expect(DAGProposalSchema.shape.reasoning.description).toContain('Rationale for the proposed workflow structure.');
  });

  it('InterviewResponseSchema requires reasoning as the first key to prevent Expert Collapse', () => {
    const keys = Object.keys(InterviewResponseSchema.shape);
    expect(keys[0]).toBe('reasoning');
    expect(InterviewResponseSchema.shape.reasoning.description).toContain('Rationale for the response or completion.');
  });
});

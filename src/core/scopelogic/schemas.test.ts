import { describe, it, expect } from 'vitest';
import { DAGProposalSchema, InterviewResponseSchema } from './schemas';
import { DAGNodeSchema } from '../basevault/schema';

describe('Rationale-First Schemas', () => {
  it('DAGProposalSchema requires reasoning as the first key to prevent Expert Collapse', () => {
    const keys = Object.keys(DAGProposalSchema.shape);
    expect(keys[0]).toBe('reasoning');
    expect(DAGProposalSchema.shape.reasoning.description).toContain('Rationale for the proposed workflow structure.');
  });

  it('DAGProposalSchema carries validated harness fields and still requires prompts', () => {
    const node = DAGProposalSchema.shape.nodes.element;
    expect(node.parse({
      id: 'planner', dependencies: [], prompt: 'plan', harness_profile: 'planner', plugin: 'x', params: { a: 1 },
    })).toMatchObject({ harness_profile: 'planner', plugin: 'x', params: { a: 1 } });
    expect(node.safeParse({ id: 'invalid', dependencies: [], prompt: 'bad', harness_profile: 'auditor' }).success).toBe(false);
    expect(DAGNodeSchema.safeParse({ id: 'optional-prompt', dependencies: [] }).success).toBe(true);
    expect(node.safeParse({ id: 'missing-prompt', dependencies: [] }).success).toBe(false);
  });

  it('InterviewResponseSchema requires reasoning as the first key to prevent Expert Collapse', () => {
    const keys = Object.keys(InterviewResponseSchema.shape);
    expect(keys[0]).toBe('reasoning');
    expect(InterviewResponseSchema.shape.reasoning.description).toContain('Rationale for the response or completion.');
  });
});

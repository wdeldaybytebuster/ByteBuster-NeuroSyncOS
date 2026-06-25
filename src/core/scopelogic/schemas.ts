import { z } from 'zod';

export const DAGNodeSchema = z.object({
  id: z.string(),
  dependencies: z.array(z.string()),
  prompt: z.string()
});

export const DAGProposalSchema = z.object({
  reasoning: z.string().describe("Rationale for the proposed workflow structure. Must be provided first to prevent Expert Collapse."),
  id: z.string(),
  status: z.enum(['draft']),
  nodes: z.array(DAGNodeSchema)
});

export const InterviewResponseSchema = z.object({
  reasoning: z.string().describe("Rationale for the response or completion. Must be provided first to prevent Expert Collapse."),
  response: z.string(),
  done: z.boolean().optional(),
  dagProposal: DAGProposalSchema.optional()
});

import { describe, it, expect } from 'vitest';
import {
  DEFERENCE_THRESHOLD,
  buildApprovalItems,
  partitionByConfidence,
  partitionByKind,
  type OsTodoLike,
} from './approvalQueue';

const todo = (id: string, confidence: number): OsTodoLike => ({
  id,
  escalation_reason: `reason-${id}`,
  severity: 'MEDIUM',
  required_action_type: 'APPROVE_PROPOSAL',
  confidence,
});

describe('buildApprovalItems', () => {
  it('normalizes os_todos into todo-kind items', () => {
    const items = buildApprovalItems([todo('a', 0.4), todo('b', 0.9)], null);
    expect(items).toHaveLength(2);
    expect(items.every(i => i.kind === 'todo')).toBe(true);
    expect(items[0]).toMatchObject({ id: 'a', description: 'reason-a', confidence: 0.4 });
  });

  it('appends a single proposal as a proposal-kind item carrying raw JSON', () => {
    const proposal = { id: 'p1', confidence: 0.5, proposal: { nodes: [{ id: 'n1' }, { id: 'n2' }] } };
    const items = buildApprovalItems([todo('a', 0.4)], proposal);
    expect(items).toHaveLength(2);
    const prop = items.find(i => i.kind === 'proposal')!;
    expect(prop.id).toBe('p1');
    expect(prop.confidence).toBe(0.5);
    expect(prop.proposal.nodes).toHaveLength(2);
    expect(prop.description).toContain('2 steps');
  });

  it('ignores a null proposal', () => {
    expect(buildApprovalItems([todo('a', 0.4)], null)).toHaveLength(1);
  });

  it('singularizes the step label for a one-node proposal', () => {
    const items = buildApprovalItems([], { id: 'p', confidence: 0.5, proposal: { nodes: [{ id: 'n1' }] } });
    expect(items[0]!.description).toContain('1 step');
    expect(items[0]!.description).not.toContain('1 steps');
  });
});

describe('partitionByConfidence', () => {
  it('routes items below the threshold to low, at/above to high', () => {
    const items = buildApprovalItems(
      [todo('lo', 0.69), todo('hi', 0.7), todo('mid', DEFERENCE_THRESHOLD)],
      null,
    );
    const { low, high } = partitionByConfidence(items);
    expect(low.map(i => i.id)).toEqual(['lo']);
    expect(high.map(i => i.id).sort()).toEqual(['hi', 'mid']);
  });

  it('keeps a default-confidence (0.5) proposal in the low/Attention bucket', () => {
    const items = buildApprovalItems([], { id: 'p', confidence: 0.5, proposal: { nodes: [] } });
    const { low, high } = partitionByConfidence(items);
    expect(low).toHaveLength(1);
    expect(high).toHaveLength(0);
  });
});

describe('regression: low-confidence todo + staged proposal on one screen', () => {
  // Mirrors the live-app bug: a 0.5 proposal and a low-confidence todo must
  // BOTH show in the "Attention Required" (low) bucket, so the "All Clear"
  // empty state (low.length === 0) is never shown while either is pending.
  const items = buildApprovalItems(
    [todo('lowTodo', 0.4), todo('hiTodo', 0.95)],
    { id: 'prop', confidence: 0.5, proposal: { nodes: [{ id: 'n1' }] } },
  );
  const { low, high } = partitionByConfidence(items);

  it('shows both the low-confidence todo and the proposal in the Attention list', () => {
    expect(low.map(i => i.id).sort()).toEqual(['lowTodo', 'prop']);
    expect(low.length).toBeGreaterThan(0); // => "All Clear" is NOT shown
  });

  it('bulk-approving the high bucket only touches os_todos (proposals default 0.5, never high)', () => {
    expect(high.map(i => i.id)).toEqual(['hiTodo']);
    const { todoIds, proposals } = partitionByKind(items, high.map(i => i.id));
    expect(todoIds).toEqual(['hiTodo']);
    expect(proposals).toHaveLength(0);
  });

  it('only reports All-Clear (low empty) once nothing is pending', () => {
    const empty = partitionByConfidence(buildApprovalItems([], null));
    expect(empty.low).toHaveLength(0);
  });
});

describe('partitionByKind', () => {
  it('splits a mixed id set into todo ids and proposal items, ignoring unknown ids', () => {
    const items = buildApprovalItems(
      [todo('t1', 0.9), todo('t2', 0.9)],
      { id: 'p1', confidence: 0.9, proposal: { nodes: [] } },
    );
    const { todoIds, proposals } = partitionByKind(items, ['t1', 'p1', 'nope', 't2']);
    expect(todoIds.sort()).toEqual(['t1', 't2']);
    expect(proposals.map(p => p.id)).toEqual(['p1']);
  });
});

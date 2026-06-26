/**
 * §3.3 — Zod schema regression suite.
 *
 * Anchors the canonical WorkflowRun + Task + Project shapes against literal
 * happy-path samples AND against the §3.4 escalation runtime values, so that
 * any future extension to the status enum (e.g. a new 'rerunning' state) has
 * to consciously update the parser and downstream consumers in lockstep.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ProjectSchema,
  WorkflowRunSchema,
  TaskSchema,
  partitionBySchema,
} from './schema';

describe('BaseVault Zod Schemas — §3.3 workflow_run / task / project canonical shapes', () => {
  describe('ProjectSchema', () => {
    it('accepts a project row with uuid id + name + epoch created_at', () => {
      const ok = ProjectSchema.safeParse({
        id: 'f4a4a5b2-1c1a-4a5b-9b3a-2b1c8e1d2e3f',
        name: 'Test Project',
        created_at: 1719292800000,
      });
      expect(ok.success).toBe(true);
    });

    it('rejects a project with a non-numeric created_at', () => {
      const bad = ProjectSchema.safeParse({
        id: 'f4a4a5b2-1c1a-4a5b-9b3a-2b1c8e1d2e3f',
        name: 'Test Project',
        created_at: 'not-a-number',
      });
      expect(bad.success).toBe(false);
    });
  });

  describe('WorkflowRunSchema', () => {
    it('accepts the four legacy terminal/active statuses', () => {
      for (const status of ['pending', 'running', 'completed', 'failed']) {
        const ok = WorkflowRunSchema.safeParse({
          id:           '11111111-2222-4333-8444-555555555555',
          project_id:   'f4a4a5b2-1c1a-4a5b-9b3a-2b1c8e1d2e3f',
          dag_layout:   JSON.stringify({ nodes: [] }),
          status,
          created_at:   1719292800000,
        });
        expect(ok.success).toBe(true);
      }
    });

    // §3.4 — escalation rows are first-class citizens of the status type.
    it('accepts status="blocked-by-validation" (introduced by §3.4 escalation sentinel rows)', () => {
      const ok = WorkflowRunSchema.safeParse({
        id:           '22222222-3333-4444-8555-666666666666',
        project_id:   'f4a4a5b2-1c1a-4a5b-9b3a-2b1c8e1d2e3f',
        dag_layout:   JSON.stringify({
          blocked_by_validation: true,
          reason:                'SA-07 Violation: reserved-label presence.',
          origin_workflow_id:    '33333333-4444-4555-8666-777777777777',
          origin:                'scheduler',
        }),
        status:       'blocked-by-validation',
        created_at:   1719292800001,
      });
      expect(ok.success).toBe(true);
    });

    it('rejects an unknown status (negative control)', () => {
      const bad = WorkflowRunSchema.safeParse({
        id:           '44444444-5555-4666-8777-888888888888',
        project_id:   'f4a4a5b2-1c1a-4a5b-9b3a-2b1c8e1d2e3f',
        dag_layout:   JSON.stringify({ nodes: [] }),
        status:       'terraformed', // not a real status
        created_at:   1719292800002,
      });
      expect(bad.success).toBe(false);
    });
  });

  describe('TaskSchema', () => {
    it('accepts the four legacy terminal/active statuses', () => {
      for (const status of ['unclaimed', 'claimed', 'completed', 'failed']) {
        const ok = TaskSchema.safeParse({
          id:           '55555555-6666-4777-8888-999999999999',
          run_id:       '11111111-2222-4333-8444-555555555555',
          status,
          claim_lease:  1719292800000,
          output_data:  null,
        });
        expect(ok.success).toBe(true);
      }
    });

    it('mirrors the run-level blocked-by-validation sentinel (so cancel/escalation sweep is symmetric)', () => {
      const ok = TaskSchema.safeParse({
        id:          '66666666-7777-4888-8999-aaaaaaaaaaaa',
        run_id:      '22222222-3333-4444-8555-666666666666',
        status:      'blocked-by-validation',
        claim_lease: null,
        output_data: JSON.stringify({
          validation_error:    'SA-07 Violation: reserved-label presence.',
          origin_workflow_id:  '33333333-4444-4555-8666-777777777777',
        }),
      });
      expect(ok.success).toBe(true);
    });

    it('rejects an unknown task status (negative control)', () => {
      const bad = TaskSchema.safeParse({
        id:          '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
        run_id:      '11111111-2222-4333-8444-555555555555',
        status:      'excommunicated',
        claim_lease: null,
        output_data: null,
      });
      expect(bad.success).toBe(false);
    });
  });

  describe('partitionBySchema() — §3.3 safeParse+drop helper (§3.3 list/detail endpoints)', () => {
    // Quiet console.error so vitest output stays clean during the dirty-row cases.
    const originalConsoleError = console.error;
    beforeEach(() => { console.error = () => {}; });
    afterEach(() => { console.error = originalConsoleError; });

    const validRun = {
      id:           '11111111-2222-4333-8444-555555555555',
      project_id:   'f4a4a5b2-1c1a-4a5b-9b3a-2b1c8e1d2e3f',
      dag_layout:   JSON.stringify({ nodes: [] }),
      status:       'completed',
      created_at:   1719292800000,
    };

    it('empty input → { clean: [], dirtyIds: [] }', () => {
      const result = partitionBySchema([], WorkflowRunSchema, 'empty-test');
      expect(result.clean).toEqual([]);
      expect(result.dirtyIds).toEqual([]);
    });

    it('all-clean input → every row in clean, dirtyIds empty', () => {
      const result = partitionBySchema(
        [validRun, { ...validRun, id: '22222222-3333-4444-8555-666666666666' }],
        WorkflowRunSchema,
        'all-clean-test',
      );
      expect(result.clean.length).toBe(2);
      expect(result.dirtyIds.length).toBe(0);
    });

    it('all-dirty input (terraformed status) → all rows dropped, IDs tracked', () => {
      const dirty1 = { ...validRun, id: '33333333-4444-4555-8666-777777777777', status: 'terraformed' };
      const dirty2 = { ...validRun, id: '44444444-5555-4666-8777-888888888888', status: 'terraformed' };
      const result = partitionBySchema([dirty1, dirty2], WorkflowRunSchema, 'all-dirty-test');
      expect(result.clean.length).toBe(0);
      expect(result.dirtyIds).toEqual([
        '33333333-4444-4555-8666-777777777777',
        '44444444-5555-4666-8777-888888888888',
      ]);
    });

    it('missing-id row → tracks id sentinel \'<missing-id>\' rather than "undefined"', () => {
      const noId = { ...validRun, id: undefined, status: 'terraformed' };
      const result = partitionBySchema([noId], WorkflowRunSchema, 'no-id-test');
      expect(result.clean.length).toBe(0);
      expect(result.dirtyIds).toEqual(['<missing-id>']);
    });

    it('null-id row → tracks id sentinel \'<missing-id>\' rather than "null"', () => {
      const noId = { ...validRun, id: null, status: 'terraformed' };
      const result = partitionBySchema([noId], WorkflowRunSchema, 'null-id-test');
      expect(result.clean.length).toBe(0);
      expect(result.dirtyIds).toEqual(['<missing-id>']);
    });

    it('empty-string id row → tracks id sentinel (empty string is not nullish but still untraceable)', () => {
      const noId = { ...validRun, id: '', status: 'terraformed' };
      const result = partitionBySchema([noId], WorkflowRunSchema, 'empty-id-test');
      expect(result.clean.length).toBe(0);
      expect(result.dirtyIds).toEqual(['<missing-id>']);
    });

    it('at-cap dirty rows (exactly 5) → 5 per-row console.error calls, NO suppressed-summary', () => {
      const dirtyRows = Array.from({ length: 5 }, (_, i) => ({
        ...validRun,
        id: `${(i + 1).toString(16).padStart(8, '0')}-ffff-4fff-8fff-ffffffffffff`,
        status: 'terraformed',
      }));
      // Spy replaces the beforeEach console.error null for this single test.
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = partitionBySchema(dirtyRows, WorkflowRunSchema, 'at-cap-test');
      expect(result.clean.length).toBe(0);
      expect(result.dirtyIds.length).toBe(5);
      // 5 per-row detail lines exactly, no second summary line (cap boundary:
      // per-row already covers everything so the short suppressed-summary is
      // suppressed at this boundary).
      expect(consoleSpy.mock.calls.length).toBe(5);
      // Sanity check each call starts with the standard prefix.
      for (const call of consoleSpy.mock.calls) {
        expect(String(call[0])).toContain('dropped schema-dirty row');
      }
      consoleSpy.mockRestore();
    });

    it('mixed clean + dirty → rows partition correctly into clean + dirtyIds', () => {
      const dirty = { ...validRun, id: '77777777-8888-4999-8aaa-bbbbbbbbbbbb', status: 'terraformed' };
      const result = partitionBySchema([validRun, dirty], WorkflowRunSchema, 'mixed-test');
      expect(result.clean.length).toBe(1);
      expect(result.clean[0]!.id).toBe(validRun.id);
      expect(result.dirtyIds).toEqual(['77777777-8888-4999-8aaa-bbbbbbbbbbbb']);
    });

    it('over-cap dirty rows → all dirty IDs preserved in dirtyIds (per-row log is internal-only throttle)', () => {
      const dirtyRows = Array.from({ length: 8 }, (_, i) => ({
        ...validRun,
        id: `${(i + 1).toString(16).padStart(8, '0')}-dddd-4ddd-8ddd-dddddddddddd`,
        status: 'terraformed',
      }));
      const result = partitionBySchema(dirtyRows, WorkflowRunSchema, 'over-cap-test');
      expect(result.clean.length).toBe(0);
      // All 8 ids present in dirtyIds (the cap only throttles stdout, not the
      // dirtyIds return array which is the API contract).
      expect(result.dirtyIds.length).toBe(8);
      expect(result.dirtyIds).toEqual(dirtyRows.map(r => r.id));
    });

    it('helper works with TaskSchema too (not just WorkflowRunSchema)', () => {
      const validTask = {
        id:          '55555555-6666-4777-8888-999999999999',
        run_id:      '11111111-2222-4333-8444-555555555555',
        status:      'completed',
        claim_lease: 1719292800000,
        output_data: null,
      };
      const dirtyTask = { ...validTask, status: 'excommunicated' };
      const result = partitionBySchema([validTask, dirtyTask], TaskSchema, 'task-mixed-test');
      expect(result.clean.length).toBe(1);
      expect(result.dirtyIds).toEqual(['55555555-6666-4777-8888-999999999999']);
    });
  });

  describe('cross-schema invariants', () => {
    it('WorkflowRun.id is uuid-format (project_id linkage invariant)', () => {
      const bad = WorkflowRunSchema.safeParse({
        id:           'not-a-uuid',
        project_id:   'f4a4a5b2-1c1a-4a5b-9b3a-2b1c8e1d2e3f',
        dag_layout:   JSON.stringify({ nodes: [] }),
        status:       'completed',
        created_at:   1719292800000,
      });
      expect(bad.success).toBe(false);
    });

    it('Task.claim_lease may be null (idle entries)', () => {
      const ok = TaskSchema.safeParse({
        id:          '88888888-9999-4aaa-8bbb-cccccccccccc',
        run_id:      '11111111-2222-4333-8444-555555555555',
        status:      'unclaimed',
        claim_lease: null,
        output_data: null,
      });
      expect(ok.success).toBe(true);
    });
  });
});

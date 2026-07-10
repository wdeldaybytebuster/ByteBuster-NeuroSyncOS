import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { ValidatorLogic } from './validator';
import { DAGProposal } from './interview';
import { db, initDB } from '../basevault/db';

const ASSERTION_KEYS = [
  'scopelogic_assertion_si01_enabled',
  'scopelogic_assertion_si03_enabled',
  'scopelogic_assertion_si05_enabled',
  'scopelogic_assertion_qr01_enabled',
];

function setAssertion(key: string, enabled: boolean) {
  db.prepare(
    "INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, String(enabled));
}

describe('ValidatorLogic (Category A Boundaries)', () => {
  beforeAll(() => {
    initDB();
  });

  // Behavioral Assertion toggles must never leak between tests.
  afterEach(() => {
    for (const key of ASSERTION_KEYS) {
      db.prepare('DELETE FROM system_settings WHERE key = ?').run(key);
    }
  });

  const createProposal = (prompts: string[]): DAGProposal => ({
    id: 'test-prop',
    status: 'draft',
    nodes: prompts.map((prompt, i) => ({ id: `node-${i}`, dependencies: [], prompt }))
  });

  it('should pass a normal benign proposal', () => {
    const proposal = createProposal(['fetch weather data', 'summarize data', 'email to user']);
    expect(ValidatorLogic.validate(proposal)).toBeNull();
  });

  it('should reject empty prompts (SA-06)', () => {
    const proposal = createProposal(['fetch data', '  ', 'end']);
    expect(ValidatorLogic.validate(proposal)).toContain('SA-06');
  });

  it('should reject forbidden SQL (SA-01/02)', () => {
    const proposal1 = createProposal(['fetch data', 'UPDATE users SET admin=1', 'end']);
    expect(ValidatorLogic.validate(proposal1)).toContain('SA-01/02');

    const proposal2 = createProposal(['drop table test']);
    expect(ValidatorLogic.validate(proposal2)).toContain('SA-01/02');
  });

  it('should reject forbidden shell commands (SA-01/02)', () => {
    const proposal1 = createProposal(['bash -c "rm -rf /"']);
    expect(ValidatorLogic.validate(proposal1)).toContain('SA-01/02');

    const proposal2 = createProposal(['sudo apt install evil']);
    expect(ValidatorLogic.validate(proposal2)).toContain('SA-01/02');
  });

  it('should reject explicit shell/exec node types (SA-04)', () => {
    const proposal = createProposal(['node_type: "shell", command: "ls"']);
    expect(ValidatorLogic.validate(proposal)).toContain('SA-04');
  });

  it('should reject unauthorized agents (SA-05)', () => {
    const proposal1 = createProposal(['agent: UnknownEvilAgent', 'do something']);
    expect(ValidatorLogic.validate(proposal1)).toContain('SA-05');
  });

  it('should allow authorized non-reserved agents (SA-05 happy-path)', () => {
    // SA-05 happy-path using non-reserved, non-engine agent names so SA-07 §1.2
    // reserved-label rule doesn't fire first.
    const proposal1 = createProposal(['agent: ExternalAPI', 'fetch third-party data']);
    expect(ValidatorLogic.validate(proposal1)).toBeNull();
    const proposal2 = createProposal(['agent: SSH', 'run remote shell']);
    expect(ValidatorLogic.validate(proposal2)).toBeNull();
  });

  it('should reject when an authorized engine-named agent collides with §1.2 reserved label (SA-07 wins over SA-05)', () => {
    // `agent: BaseVault` is whitelisted by SA-05, but SA-07 catches the reserved
    // token first. This is the intentional §1.2 design constraint — engine
    // names are orchestrators, never workflow tasks.
    const proposal = createProposal(['agent: BaseVault', 'store this']);
    expect(ValidatorLogic.validate(proposal)).toMatch(/SA-07/);
  });

  // §1.2 — Reserved system-service labels must never appear as workflow tasks.
  it('should reject nodes that start with a reserved token (SA-07)', () => {
    const proposal1 = createProposal(['scopelogic interview']);
    expect(ValidatorLogic.validate(proposal1)).toMatch(/SA-07.*scopelogic/);

    const proposal2 = createProposal(['basevault lookup']);
    expect(ValidatorLogic.validate(proposal2)).toMatch(/SA-07.*basevault/);
  });

  it('should reject nodes that reference a reserved token mid-prompt (SA-07)', () => {
    // Critical edge case: regex sweep catches any-token reference.
    const proposal1 = createProposal(['Use RouteSwitch to triage results', 'send to user']);
    expect(ValidatorLogic.validate(proposal1)).toMatch(/SA-07.*routeswitch/);

    const proposal2 = createProposal(['Run, BaseVault write please']);
    expect(ValidatorLogic.validate(proposal2)).toMatch(/SA-07.*basevault/);
  });

  it('should report the actual matched reserved label (SA-07)', () => {
    const proposal = createProposal(['then forward to Cerebro for embedding']);
    const msg = ValidatorLogic.validate(proposal);
    expect(msg).toContain('SA-07');
    expect(msg).toContain('cerebro');
  });

  it('should allow prompts whose similar strings are not word-boundary matches (SA-07)', () => {
    // 'preconfigured' contains 'configured' but not the reserved 'scoutdaemon'/'coreexec'.
    // 'lowscopelogic' contains 'scopelogic' but without a word boundary prefix.
    expect(ValidatorLogic.validate(createProposal(['preconfigured data', 'lowscopelogic threshold']))).toBeNull();
  });
});

// ─── Behavioral Assertion Framework — toggleable SI-*/QR-01 checks ─────────
// Proves the ScopeLogicDashboard "Behavioral Assertion" toggles (Control D)
// actually gate ValidatorLogic.validate()'s outcome: same proposal, setting
// on vs off, different accept/reject result. Each toggleable assertion
// defaults OFF (permissive / matches pre-existing behavior) when its
// system_settings key has never been saved.
describe('ValidatorLogic — Behavioral Assertion toggles', () => {
  beforeAll(() => {
    initDB();
  });

  afterEach(() => {
    for (const key of ASSERTION_KEYS) {
      db.prepare('DELETE FROM system_settings WHERE key = ?').run(key);
    }
  });

  describe('QR-01 — Reasoning key present', () => {
    const proposalNoReasoning: DAGProposal = {
      id: 'p1', status: 'draft',
      nodes: [{ id: 'n1', dependencies: [], prompt: 'fetch weather data' }],
    };

    it('passes when disabled (default) even without a reasoning field', () => {
      expect(ValidatorLogic.validate(proposalNoReasoning)).toBeNull();
    });

    it('rejects a proposal missing reasoning once enabled', () => {
      setAssertion('scopelogic_assertion_qr01_enabled', true);
      expect(ValidatorLogic.validate(proposalNoReasoning)).toContain('QR-01');
    });

    it('passes once enabled if reasoning IS present', () => {
      setAssertion('scopelogic_assertion_qr01_enabled', true);
      const withReasoning: DAGProposal = { ...proposalNoReasoning, reasoning: 'Fetches current weather for the summary step.' };
      expect(ValidatorLogic.validate(withReasoning)).toBeNull();
    });
  });

  describe('SI-05 — Confidence above minimum', () => {
    const lowConfidence: DAGProposal = {
      id: 'p2', status: 'draft', confidence: 0.1,
      nodes: [{ id: 'n1', dependencies: [], prompt: 'summarize results' }],
    };

    it('passes when disabled (default) even with low confidence', () => {
      expect(ValidatorLogic.validate(lowConfidence)).toBeNull();
    });

    it('rejects low confidence once enabled', () => {
      setAssertion('scopelogic_assertion_si05_enabled', true);
      expect(ValidatorLogic.validate(lowConfidence)).toContain('SI-05');
    });

    it('passes once enabled if confidence clears the minimum', () => {
      setAssertion('scopelogic_assertion_si05_enabled', true);
      const highConfidence: DAGProposal = { ...lowConfidence, confidence: 0.9 };
      expect(ValidatorLogic.validate(highConfidence)).toBeNull();
    });
  });

  describe('SI-01 — Output shape validity (JSON)', () => {
    const danglingDep: DAGProposal = {
      id: 'p3', status: 'draft',
      nodes: [{ id: 'n1', dependencies: ['does-not-exist'], prompt: 'fetch data' }],
    };

    it('passes when disabled (default) even with a dangling dependency ref', () => {
      expect(ValidatorLogic.validate(danglingDep)).toBeNull();
    });

    it('rejects a dangling dependency ref once enabled', () => {
      setAssertion('scopelogic_assertion_si01_enabled', true);
      expect(ValidatorLogic.validate(danglingDep)).toContain('SI-01');
    });

    it('passes once enabled if the proposal is well-formed', () => {
      setAssertion('scopelogic_assertion_si01_enabled', true);
      const wellFormed: DAGProposal = {
        id: 'p3b', status: 'draft',
        nodes: [
          { id: 'n1', dependencies: [], prompt: 'fetch data' },
          { id: 'n2', dependencies: ['n1'], prompt: 'process it' },
        ],
      };
      expect(ValidatorLogic.validate(wellFormed)).toBeNull();
    });
  });

  describe('SI-03 — Explanation non-empty (minimum-length prompt)', () => {
    const terseProposal: DAGProposal = {
      id: 'p4', status: 'draft',
      nodes: [{ id: 'n1', dependencies: [], prompt: 'x' }],
    };

    it('passes when disabled (default) even with a 1-word prompt', () => {
      expect(ValidatorLogic.validate(terseProposal)).toBeNull();
    });

    it('rejects a too-short explanation once enabled', () => {
      setAssertion('scopelogic_assertion_si03_enabled', true);
      expect(ValidatorLogic.validate(terseProposal)).toContain('SI-03');
    });

    it('passes once enabled if the prompt is descriptive enough', () => {
      setAssertion('scopelogic_assertion_si03_enabled', true);
      const descriptive: DAGProposal = { ...terseProposal, nodes: [{ id: 'n1', dependencies: [], prompt: 'fetch the latest weather data' }] };
      expect(ValidatorLogic.validate(descriptive)).toBeNull();
    });
  });
});

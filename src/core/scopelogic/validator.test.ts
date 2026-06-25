import { describe, it, expect } from 'vitest';
import { ValidatorLogic } from './validator';
import { DAGProposal } from './interview';

describe('ValidatorLogic (Category A Boundaries)', () => {
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

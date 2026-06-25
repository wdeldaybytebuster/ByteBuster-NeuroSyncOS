import { describe, it, expect } from 'vitest';
import {
  RESERVED_DAG_LABELS,
  isReservedDAGPrompt,
  findReservedLabel,
} from './system-reserved';

describe('RESERVED_DAG_LABELS (§1.2 canonical registry)', () => {
  it('contains the seven foundational engine identifiers', () => {
    for (const key of ['scopelogic', 'basevault', 'routeswitch', 'scoutdaemon', 'coreexec', 'portgrid', 'cerebro']) {
      expect(RESERVED_DAG_LABELS).toContain(key);
    }
    expect(RESERVED_DAG_LABELS).toHaveLength(7);
  });

  it('lowercase-canonical form (no TitleCase variants)', () => {
    for (const k of RESERVED_DAG_LABELS) {
      expect(k).toBe(k.toLowerCase());
    }
  });
});

describe('findReservedLabel() — word-boundary scanner (§1.2)', () => {
  it('returns matched label lowercased', () => {
    expect(findReservedLabel('scopelogic analysis')).toBe('scopelogic');
    expect(findReservedLabel('RouteSwitch Did Thing')).toBe('routeswitch');
    expect(findReservedLabel('emit via Cerebro')).toBe('cerebro');
  });
  it('catches mid-prompt references (key bug fix: previously missed)', () => {
    expect(findReservedLabel('Use RouteSwitch to triage')).toBe('routeswitch');
    expect(findReservedLabel('Run BaseVault for lookup')).toBe('basevault');
    expect(findReservedLabel('then forward to cereBRo')).toBe('cerebro');
  });
  it('catches after punctuation', () => {
    expect(findReservedLabel('Run, ScopeLogic Parse')).toBe('scopelogic');
    expect(findReservedLabel('Do it: BaseVault write')).toBe('basevault');
  });
  it('catches hyphenated and dotted forms (non-word separators)', () => {
    expect(findReservedLabel('BaseVault-foo')).toBe('basevault');
    expect(findReservedLabel('coreExec.handle')).toBe('coreexec');
    expect(findReservedLabel('then BaseVault.write please')).toBe('basevault');
  });

  it('does NOT match identifiers where reserved label is part of a larger underscore-word (compound identifier)', () => {
    // `_` is a word character in regex, so `\brouteswitch\b` does NOT trigger
    // when routeswitch is glued to `_v2`. Correct behavior — variable names
    // like `routeswitch_v2` shouldn't trip the reserved-label filter.
    expect(findReservedLabel('routeswitch_v2')).toBe('');
    expect(findReservedLabel('my_basevault_handle')).toBe('');
    expect(findReservedLabel('cerebroVectors')).toBe('');
  });
  it('does not match substrings (word boundary integrity)', () => {
    expect(findReservedLabel('lowscopelogic')).toBe('');
    expect(findReservedLabel('preconfigured')).toBe('');
  });
  it('returns empty for benign prompts', () => {
    expect(findReservedLabel('fetch weather data')).toBe('');
    expect(findReservedLabel('summarize then email')).toBe('');
  });
  it('returns empty for empty / whitespace input', () => {
    expect(findReservedLabel('')).toBe('');
    expect(findReservedLabel('   ')).toBe('');
  });
});

describe('isReservedDAGPrompt()', () => {
  it('returns true for any reserved-label hit', () => {
    expect(isReservedDAGPrompt('scopelogic')).toBe(true);
    expect(isReservedDAGPrompt('Use cerebro for memory')).toBe(true);
  });
  it('returns false for benign prompts', () => {
    expect(isReservedDAGPrompt('fetch data')).toBe(false);
    expect(isReservedDAGPrompt('weather')).toBe(false);
  });
  it('returns false for empty input', () => {
    expect(isReservedDAGPrompt('')).toBe(false);
    expect(isReservedDAGPrompt('   ')).toBe(false);
  });

  it('matches every reserved label case-insensitively (parametrised coverage of all 7)', () => {
    for (const label of RESERVED_DAG_LABELS) {
      expect(isReservedDAGPrompt(label)).toBe(true);                                                // canonical lowercase
      expect(isReservedDAGPrompt(label.toUpperCase())).toBe(true);                                  // UPPERCASE
      expect(isReservedDAGPrompt(label.charAt(0).toUpperCase() + label.slice(1))).toBe(true);       // PascalCase
      expect(isReservedDAGPrompt('prefix ' + label + ' suffix')).toBe(true);                          // mid-prompt
    }
  });

  it('rejects fan-out edge cases (negative control against regex-engine drift)', () => {
    // Words that look like reserved labels split by whitespace must NOT trip.
    expect(isReservedDAGPrompt('route switch')).toBe(false);
    expect(isReservedDAGPrompt('base vault')).toBe(false);
    expect(isReservedDAGPrompt('scout daemon')).toBe(false);

    // Reserved label substring with a clean non-word-char suffix: the prefix
    // alone should NOT trip findReservedLabel (verifies that the trailing
    // \b anchor and the closing char are both required).
    expect(findReservedLabel('routeswit')).toBe('');     // missing terminal letters
    expect(findReservedLabel('route')).toBe('');          // missing 'switch' part
    expect(findReservedLabel('scopelo')).toBe('');        // missing 'gic' part

    // Mid-token truncation: reserved label glued to arbitrary text on both sides
    // would slip through if the regex ever degrades to plain substring matching.
    expect(findReservedLabel('xxrouteswitchyy')).toBe(''); // glued at both ends
    expect(findReservedLabel('routeswitch_v2')).toBe('');  // underscore-glued

    // Long non-matching input must not crash and must return empty string.
    expect(findReservedLabel('a' + 'x'.repeat(1000))).toBe('');
    expect(isReservedDAGPrompt('a' + 'x'.repeat(1000))).toBe(false);
  });
});

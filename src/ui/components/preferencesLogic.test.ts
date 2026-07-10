import { describe, it, expect } from 'vitest';
import { coerceBooleanSetting, shouldShowHelpTip } from './preferencesLogic';

describe('coerceBooleanSetting', () => {
  it('returns the fallback when the setting was never saved (undefined)', () => {
    expect(coerceBooleanSetting(undefined, true)).toBe(true);
    expect(coerceBooleanSetting(undefined, false)).toBe(false);
  });

  it('recognizes a genuine boolean true/false (the common case: JSON.parse round-trip)', () => {
    expect(coerceBooleanSetting(true, false)).toBe(true);
    expect(coerceBooleanSetting(false, true)).toBe(false);
  });

  it('recognizes the string "true"/"false" defensively (raw un-JSON-parsed value)', () => {
    expect(coerceBooleanSetting('true', false)).toBe(true);
    expect(coerceBooleanSetting('false', true)).toBe(false);
  });

  it('treats any other value as false, not as the fallback', () => {
    expect(coerceBooleanSetting('nonsense', true)).toBe(false);
    expect(coerceBooleanSetting(0, true)).toBe(false);
    expect(coerceBooleanSetting(null, true)).toBe(false);
  });
});

describe('shouldShowHelpTip', () => {
  it('is visible only for Hobbyist Mode + SmartTips on', () => {
    expect(shouldShowHelpTip(false, true)).toBe(true);
  });

  it('is hidden in Developer Mode regardless of SmartTips', () => {
    expect(shouldShowHelpTip(true, true)).toBe(false);
    expect(shouldShowHelpTip(true, false)).toBe(false);
  });

  it('is hidden in Hobbyist Mode once SmartTips is turned off — the actual fix', () => {
    expect(shouldShowHelpTip(false, false)).toBe(false);
  });
});

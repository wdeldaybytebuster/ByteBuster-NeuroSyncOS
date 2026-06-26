import { describe, it, expect } from 'vitest';
import { SensitiveDataRedactor, DataTier } from './redactor';

describe('SensitiveDataRedactor', () => {
  it('should fully redact confidential data', () => {
    expect(SensitiveDataRedactor.redact('some text', DataTier.CONFIDENTIAL)).toBe('[REDACTED CONFIDENTIAL DATA]');
  });

  it('should redact API keys in public tier', () => {
    expect(SensitiveDataRedactor.redact('my key is sk-12345678901234567890abcd', DataTier.PUBLIC)).toContain('[REDACTED API KEY]');
  });

  it('should redact PII in internal tier', () => {
    expect(SensitiveDataRedactor.redact('email me at test@example.com', DataTier.INTERNAL)).toContain('[REDACTED EMAIL]');
    expect(SensitiveDataRedactor.redact('call 555-555-5555', DataTier.INTERNAL)).toContain('[REDACTED PHONE]');
  });

  it('should not redact PII in public tier (by design)', () => {
    expect(SensitiveDataRedactor.redact('email test@example.com', DataTier.PUBLIC)).toContain('test@example.com');
  });
});

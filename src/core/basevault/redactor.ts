export enum DataTier {
  PUBLIC = 'Public',
  INTERNAL = 'Internal',
  CONFIDENTIAL = 'Confidential'
}

export class SensitiveDataRedactor {
  private static apiKeysPattern = /(sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9_-]{20,})/gi;
  private static emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  private static phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/gi;

  public static redact(text: string | null | undefined, tier: DataTier): string {
    if (!text) return text === null ? 'null' : (text === undefined ? 'undefined' : '');
    let redactedText = text;

    if (tier === DataTier.CONFIDENTIAL) {
      return '[REDACTED CONFIDENTIAL DATA]';
    }

    redactedText = redactedText.replace(this.apiKeysPattern, '[REDACTED API KEY]');

    if (tier === DataTier.INTERNAL) {
      redactedText = redactedText.replace(this.emailPattern, '[REDACTED EMAIL]');
      redactedText = redactedText.replace(this.phonePattern, '[REDACTED PHONE]');
    }

    return redactedText;
  }
  
  public static redactObject(obj: any, tier: DataTier): any {
    if (!obj) return obj;
    if (typeof obj === 'string') return this.redact(obj, tier);
    if (Array.isArray(obj)) return obj.map(item => this.redactObject(item, tier));
    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = this.redactObject(value, tier);
        }
      }
      return result;
    }
    return obj;
  }
}

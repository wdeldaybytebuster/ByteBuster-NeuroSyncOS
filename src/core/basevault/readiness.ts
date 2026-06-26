import { db } from './db';

export const readiness = {
  get configured(): boolean {
    try {
      const row = db.prepare("SELECT value FROM system_settings WHERE key = 'llm_api_key'").get() as {value: string} | undefined;
      return !!row?.value && row.value.length > 0;
    } catch {
      return false;
    }
  }
};

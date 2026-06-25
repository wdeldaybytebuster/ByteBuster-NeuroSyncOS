import { describe, it, expect } from 'vitest';
import { DBSync } from './db-sync';

describe('DBSync Micro-Batching', () => {
  it('should chunk inserts and yield to event loop', async () => {
    const dbMock = {
      run: (query: string, batch: any[], cb: () => void) => {
        cb();
      }
    };
    const sync = new DBSync(dbMock);
    
    const symbols = Array.from({ length: 150 }, (_, i) => ({ id: i, name: `sym${i}` }));
    
    const start = Date.now();
    await sync.insertSymbols(symbols);
    const end = Date.now();
    
    // 150 items at 50 per batch = 3 batches.
    // 3 yields of 5ms each = at least 15ms elapsed.
    expect(end - start).toBeGreaterThanOrEqual(10);
  });
});

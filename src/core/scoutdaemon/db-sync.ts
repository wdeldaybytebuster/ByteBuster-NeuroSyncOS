export class DBSync {
  private db: any;

  constructor(dbConnection: any) {
    this.db = dbConnection;
  }

  async insertSymbols(symbols: any[]): Promise<void> {
    const BATCH_SIZE = 50; // Micro-batch size to ensure <50ms execution windows
    
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      
      // Execute DB insert for the micro-batch
      await this.insertBatch(batch);
      
      // Yield to event loop to avoid SQLite lock starvation
      await new Promise(resolve => setTimeout(resolve, 5)); 
    }
  }

  private async insertBatch(batch: any[]): Promise<void> {
    // Simulate fast DB write (or actual write in real implementation)
    return new Promise(resolve => {
      if (this.db && typeof this.db.run === 'function') {
        // mock actual db run
        this.db.run('INSERT INTO symbols ...', batch, resolve);
      } else {
        process.nextTick(resolve);
      }
    });
  }
}

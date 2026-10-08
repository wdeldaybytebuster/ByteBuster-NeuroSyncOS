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
    return new Promise(resolve => {
      if (this.db && typeof this.db.prepare === 'function') {
        const stmt = this.db.prepare(
          'INSERT OR IGNORE INTO scout_symbols (id, project_id, file_path, symbol_type, symbol_name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const insertMany = this.db.transaction((symbols: any[]) => {
          for (const sym of symbols) {
            stmt.run(
              sym.id || require('crypto').randomUUID(),
              sym.project_id || null,
              sym.file_path || 'unknown',
              sym.type,
              sym.name,
              Date.now()
            );
          }
        });
        insertMany(batch);
        resolve();
      } else {
        process.nextTick(resolve);
      }
    });
  }
}

const Database = require('better-sqlite3');
const db = new Database('data/neurosync.db');

const providers = db.prepare('SELECT * FROM llm_providers').all();
console.log('Providers:', providers);

const rules = db.prepare('SELECT * FROM llm_routing_rules').all();
console.log('Routing Rules:', rules);


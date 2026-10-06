const Database = require('better-sqlite3');
const fs = require('fs');

const dbPath = '.data/neurosync.db';
const db = new Database(dbPath);

const rules = db.prepare('SELECT * FROM llm_routing_rules').all();
console.log('Routing Rules:', rules);

// We should make sure Local Endpoint is the primary global provider
const globalRule = db.prepare('SELECT * FROM llm_routing_rules WHERE scope = ?').get('global');
const providerId = 'prov_47ab544d2225'; // The Local Endpoint
if (globalRule) {
  let chain = JSON.parse(globalRule.provider_chain);
  if (chain[0] !== providerId) {
    chain.unshift(providerId);
    chain = Array.from(new Set(chain)); // remove duplicates
    db.prepare('UPDATE llm_routing_rules SET provider_chain = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(chain), Date.now(), globalRule.id);
    console.log('Updated global rule to use Local Endpoint as primary.');
  } else {
    console.log('Local Endpoint is already the primary global provider.');
  }
} else {
  // create global rule
  db.prepare('INSERT INTO llm_routing_rules (id, scope, provider_chain, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('rule_global', 'global', JSON.stringify([providerId]), Date.now(), Date.now());
  console.log('Inserted new global rule for Local Endpoint.');
}

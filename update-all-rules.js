const Database = require('better-sqlite3');
const db = new Database('.data/neurosync.db');

const rules = db.prepare('SELECT * FROM llm_routing_rules').all();
const providerId = 'prov_47ab544d2225'; // The Local Endpoint

for (const rule of rules) {
  let chain = JSON.parse(rule.provider_chain);
  if (chain[0] !== providerId) {
    chain.unshift(providerId);
    chain = Array.from(new Set(chain));
    db.prepare('UPDATE llm_routing_rules SET provider_chain = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(chain), Date.now(), rule.id);
    console.log(`Updated rule ${rule.scope} to use Local Endpoint.`);
  }
}

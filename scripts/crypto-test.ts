import Database from 'better-sqlite3';
import path from 'path';

async function testCrypto() {
  console.log("🚀 Starting E2E Test: System Settings AES-GCM Cryptography");

  try {
    const testKey = "sk-ant-testkey123456789";
    
    // 1. Post the key to the API
    console.log("1. Saving API Key to System Settings...");
    const postRes = await fetch('http://localhost:3743/api/system/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llm_api_key: testKey })
    });
    
    if (!postRes.ok) throw new Error("Failed to post settings");
    console.log("   ✅ POST successful.");

    // 2. Fetch the key via API and ensure it's masked
    console.log("\n2. Fetching settings via API (Should be Masked)...");
    const getRes = await fetch('http://localhost:3743/api/system/settings');
    const getData = await getRes.json();
    
    if (getData.settings.llm_api_key === testKey) {
      throw new Error("❌ FAILURE: API leaked the plaintext key!");
    } else if (getData.settings.llm_api_key.includes('...****')) {
      console.log(`   ✅ SUCCESS: API masked the key: ${getData.settings.llm_api_key}`);
    } else {
      throw new Error(`❌ FAILURE: Unexpected key format: ${getData.settings.llm_api_key}`);
    }

    // 3. Inspect raw SQLite database to ensure it's encrypted
    console.log("\n3. Inspecting raw SQLite database (Must be Encrypted)...");
    const dbPath = path.join(process.cwd(), '.data', 'neurosync.db');
    const db = new Database(dbPath);
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('llm_api_key') as any;
    
    if (!row) throw new Error("Key not found in database");
    
    console.log(`   --> Raw DB Value: ${row.value}`);
    if (row.value === testKey) {
      throw new Error("❌ CRITICAL SECURITY FAILURE: Key is plaintext in the database!");
    } else if (row.value.split(':').length === 3) {
      console.log("   ✅ SUCCESS: Key is properly encrypted with AES-256-GCM (IV:AuthTag:Ciphertext format)!");
    } else {
      throw new Error("❌ FAILURE: Key is not in expected encrypted format.");
    }

    // 4. Test Crypto module directly
    console.log("\n4. Testing Core Crypto module Decryption...");
    const { decrypt } = require('../src/core/basevault/crypto');
    const decrypted = decrypt(row.value);
    
    if (decrypted === testKey) {
      console.log("   ✅ SUCCESS: BaseVault Crypto successfully decrypted the key for internal engine use.");
    } else {
      throw new Error(`❌ FAILURE: Decryption failed. Expected ${testKey}, got ${decrypted}`);
    }

    console.log("\n✅ E2E Crypto Test Completed Successfully!");
  } catch (error) {
    console.error("E2E Crypto Test Failed:", error);
  }
}

testCrypto();

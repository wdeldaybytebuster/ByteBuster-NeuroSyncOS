/**
 * Operator-only LIVE integration test (§2.3 C9 — moved out of src/ so it can
 * never be imported by production code or the test runner).
 *
 * Makes REAL network calls (Zen discovery + OpenRouter completion). Runs only
 * when explicitly requested:  NEUROSYNC_LIVE_TEST=1 npx tsx scripts/live-test.ts
 * (the plan's env-var name contained a typo — "NEurOSYNC" — implemented here
 * correctly as NEUROSYNC_LIVE_TEST; documented as a §2.3 C9 deviation).
 */
import { initDB } from '../src/core/basevault/db';
import { ZenDiscoveryService } from '../src/core/routeswitch/discovery';
import { classifyComplexity } from '../src/core/routeswitch/model-selector/classifier';
import { selectOptimalModel } from '../src/core/routeswitch/model-selector/dynamic-router';
import { executeWithFallback } from '../src/core/routeswitch/router';

async function runTest() {
  console.log('--- LIVE INTEGRATION TEST START ---');
  
  console.log('1. Initializing DB...');
  initDB();

  console.log('2. Fetching free models via ZenDiscoveryService...');
  const freeModels = await ZenDiscoveryService.getFreeModels();
  console.log(`   Found ${freeModels.length} free models.`);

  const prompt = "Explain quantum entanglement mathematically";
  console.log(`3. Using Prompt: "${prompt}"`);

  const complexity = classifyComplexity(prompt);
  console.log(`4. Classified complexity: ${complexity}`);

  const mappedModels = freeModels.map(m => ({
    id: m.id,
    context_limit: m.context_length
  }));

  let optimalModel = 'groq/llama3-8b-8192';
  try {
    optimalModel = selectOptimalModel(complexity, 'intelligence', mappedModels, []);
    console.log(`5. Optimal model selected: ${optimalModel}`);
  } catch (e) {
    console.warn(`   Warning: selectOptimalModel failed (${e}), using default.`);
  }

  console.log('6. Executing with FallbackRouter...');
  try {
    const result = await executeWithFallback(prompt, [optimalModel]);
    console.log('   Response received successfully.');
    
    // Print a truncated preview of the response content
    const content = result.choices?.[0]?.message?.content || JSON.stringify(result);
    console.log(`\n--- RESULT PREVIEW ---\n${content.substring(0, 300)}...\n----------------------`);
  } catch (error) {
    console.error('   Execution failed:', error);
  }
}

if (process.env.NEUROSYNC_LIVE_TEST === '1') {
  runTest().catch(console.error);
} else {
  console.log(
    '[live-test] skipped — set NEUROSYNC_LIVE_TEST=1 to run (this script makes real network calls).',
  );
}

import { initDB } from '../basevault/db';
import { ZenDiscoveryService } from './discovery';
import { classifyComplexity } from './model-selector/classifier';
import { selectOptimalModel } from './model-selector/dynamic-router';
import { executeWithFallback } from './router';

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

runTest().catch(console.error);

import { Hono } from 'hono';
import { RouteSwitchEngine } from '../../core/routeswitch/engine';
import { MockProvider } from '../../core/routeswitch/providers';
import { OpenAICompatibleProvider } from '../../core/routeswitch/adapters/openai-compatible';
import { LlamaCppProvider } from '../../core/routeswitch/adapters/llama-cpp';
import { FreeModeGovernor } from '../../core/routeswitch/governor';

export const llmRouter = new Hono();

// We will inject the singleton RouteSwitchEngine and Governor here when mounting
export let activeEngine: RouteSwitchEngine | null = null;
export let activeGovernor: FreeModeGovernor | null = null;

export const injectLLMEngine = (engine: RouteSwitchEngine, governor: FreeModeGovernor) => {
  activeEngine = engine;
  activeGovernor = governor;
};

// Current active configuration state
let currentConfig = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:1234/v1',
  modelId: 'Auto',
  apiKey: '',
  modelPath: '/models/llama-3.gguf',
  councilRisk: 70
};

llmRouter.get('/config', (c) => {
  return c.json({
    success: true,
    config: currentConfig,
    telemetry: activeGovernor ? activeGovernor.getStatus() : null
  });
});

// §3.2 — 24h rolling usage aggregate for the RouteSwitch dashboard.
// Returns { success, usage24h: { tokens, costUsd, requests, byProvider, windowMs, generatedAt } }.
// The window prunes records older than 24h on read so the in-memory buffer
// stays bounded under long-running processes.
llmRouter.get('/usage', (c) => {
  if (!activeGovernor) {
    return c.json({ success: false, error: 'LLM Engine not initialized' }, 500);
  }
  return c.json({
    success: true,
    usage24h: activeGovernor.getUsage24h(),
  });
});

llmRouter.post('/config', async (c) => {
  if (!activeEngine) {
    return c.json({ success: false, error: 'LLM Engine not initialized' }, 500);
  }

  const body = await c.req.json();
  currentConfig = { ...currentConfig, ...body };

  try {
    if (currentConfig.provider === 'mock') {
      activeEngine.setProvider(new MockProvider());
    } else if (currentConfig.provider === 'openai-compatible') {
      activeEngine.setProvider(new OpenAICompatibleProvider({
        baseUrl: currentConfig.baseUrl,
        modelId: currentConfig.modelId,
        apiKey: currentConfig.apiKey
      }));
    } else if (currentConfig.provider === 'llama-cpp') {
      activeEngine.setProvider(new LlamaCppProvider({
        modelPath: currentConfig.modelPath
      }));
    }

    return c.json({ success: true, config: currentConfig });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

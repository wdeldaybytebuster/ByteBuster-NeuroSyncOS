import { Hono } from 'hono';
import { ModelDiscovery } from '../../core/routeswitch/discovery';

export const modelsRouter = new Hono();

modelsRouter.get('/', async (c) => {
  try {
    const models = ModelDiscovery.getAvailableModels();
    return c.json({ success: true, models });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

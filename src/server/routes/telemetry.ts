import { Hono } from 'hono';
import * as client from 'prom-client';

const telemetryRouter = new Hono();

// Initialize the default metrics collection
// This collects memory, CPU, and event loop metrics from Node.js
client.collectDefaultMetrics({ prefix: 'neurosync_' });

// Example custom metric: Counter for total API requests
export const httpRequestCounter = new client.Counter({
  name: 'neurosync_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

telemetryRouter.get('/metrics', async (c) => {
  try {
    const metrics = await client.register.metrics();
    return c.text(metrics, 200, {
      'Content-Type': client.register.contentType,
    });
  } catch (error) {
    console.error('[Telemetry] Failed to collect metrics:', error);
    return c.json({ error: 'Failed to collect metrics' }, 500);
  }
});

export default telemetryRouter;

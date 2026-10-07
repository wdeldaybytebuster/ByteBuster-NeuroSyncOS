// Verbatim logic of d6e5869 server-main.ts:41-80 with readiness.configured=false
// (proven above: live DB has no llm_api_key row).
import { Hono } from 'hono';
const readiness = { configured: false };
const oldMiddleware = async (c: any, next: any) => {
  const path = c.req.path;
  if (path.startsWith('/health') || path.startsWith('/api/config')) return next();
  if (!readiness.configured) return next();
  const authHeader = c.req.header('Authorization');
  if (!authHeader) { if (path.startsWith('/api/')) return c.json({ error: 'Unauthorized' }, 401); }
  await next();
};
async function main() {
const app = new Hono();
app.use('*', oldMiddleware);
app.get('/api/cerebro/query', (c) => c.json({ rows: ['SECRET-DB-ROWS'] }));
const anon = await app.request('/api/cerebro/query', { method: 'GET' });
console.log('OLD-CODE anonymous:', anon.status, await anon.text());
const garbage = await app.request('/api/cerebro/query', { method: 'GET', headers: { Authorization: 'Bearer garbage' } });
console.log('OLD-CODE bearer-garbage:', garbage.status, await garbage.text());
}
main();

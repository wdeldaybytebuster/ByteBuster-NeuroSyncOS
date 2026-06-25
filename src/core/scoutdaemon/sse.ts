import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventEmitter } from 'events';

export const scoutEmitter = new EventEmitter();
export const scoutRouter = new Hono();

import { idleDetector } from './idle';

scoutRouter.post('/heartbeat', async (c) => {
  idleDetector.ping();
  return c.json({ success: true });
});

scoutRouter.get('/events', async (c) => {
  return streamSSE(c, async (stream) => {
    let id = 0;
    
    // Initial connection ping
    await stream.writeSSE({
      data: JSON.stringify({ type: 'connected', message: 'ScoutDaemon SSE Connected' }),
      event: 'ping',
      id: String(id++),
    });

    // Event listener for pushing updates
    const onUpdate = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: 'scout-update',
          id: String(id++),
        });
      } catch (err) {
        console.error('SSE Write Error:', err);
      }
    };

    scoutEmitter.on('update', onUpdate);

    // Keep-alive heartbeat (every 15 seconds)
    const interval = setInterval(async () => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }),
          event: 'ping',
          id: String(id++),
        });
      } catch (err) {
        // Will throw if client has cleanly disconnected
      }
    }, 15000);

    // Wait until the client disconnects
    await new Promise((resolve) => {
      c.req.raw.signal.addEventListener('abort', () => {
        clearInterval(interval);
        scoutEmitter.off('update', onUpdate);
        resolve(null);
      });
    });
  });
});

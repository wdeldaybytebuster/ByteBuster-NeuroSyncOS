import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { openWebSocket } from '../lib/api';

/**
 * P2-3 — terminal WS base: the page's own host in the browser (tracks a
 * custom NEUROSYNC_PORT automatically), compiled default under node/tests.
 *
 * F-4 — the URL's security posture is layered (do not weaken any layer):
 *   1. `openWebSocket` (src/ui/lib/api.ts) appends a 30 s, path-scoped
 *      `?ticket=` minted from the live session — a browser WebSocket cannot
 *      set an Authorization header, and the ticket is valid only on
 *      TICKET_PATHS (which includes '/api/portgrid/terminal/').
 *   2. The route itself sits under /api/ behind the app's auth middleware.
 *   3. `wsUpgradeGuard` (src/server/perimeter.ts, wired at server-main.ts
 *      :231) refuses a socketless upgrade attempt with a deliberate 401
 *      before any TerminalSession can spawn — the shell is real, so the
 *      gate decision must precede any bwrap spawn.
 * A same-host WS_BASE is what makes layers 1–2 apply at all: a hardcoded
 * foreign origin would bypass both the ticket path check and the loopback
 * perimeter classification.
 */
function resolveWsBase(): string {
  try {
    if (typeof window !== 'undefined' && typeof window.location?.host === 'string' && window.location.host) {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${window.location.host}`;
    }
  } catch {
    /* no DOM — fall through to the compiled default */
  }
  return 'ws://localhost:3743';
}

const WS_BASE = resolveWsBase();

interface EmbeddedTerminalProps {
  projectId: string;
  accentColor?: string;
}

/**
 * Task 8 — Interactive embedded terminal.
 *
 * Renders a real xterm.js terminal and pipes it over a WebSocket to a hardened,
 * directory- and network-sandboxed shell on the backend
 * (/api/portgrid/terminal/:projectId). Human-driven only: mounted solely when a
 * person explicitly opens the panel in the UI.
 */
export function EmbeddedTerminal({ projectId, accentColor = '#00FFCC' }: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: accentColor,
      },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    const safeFit = () => {
      try { fit.fit(); } catch { /* not measured yet */ }
    };
    safeFit();

    const ws = openWebSocket(`${WS_BASE}/api/portgrid/terminal/${encodeURIComponent(projectId)}`);

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    ws.onopen = () => {
      term.writeln('\x1b[90mConnecting to sandboxed shell…\x1b[0m');
      safeFit();
      sendResize();
    };
    ws.onmessage = (evt) => {
      term.write(typeof evt.data === 'string' ? evt.data : '');
    };
    ws.onclose = () => {
      term.writeln('\r\n\x1b[90m[disconnected]\x1b[0m');
    };
    ws.onerror = () => {
      term.writeln('\r\n\x1b[31m[connection error]\x1b[0m');
    };

    const dataSub = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const onWindowResize = () => {
      safeFit();
      sendResize();
    };
    window.addEventListener('resize', onWindowResize);

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        safeFit();
        sendResize();
      });
      ro.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', onWindowResize);
      ro?.disconnect();
      dataSub.dispose();
      try { ws.close(); } catch { /* ignore */ }
      term.dispose();
    };
  }, [projectId, accentColor]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

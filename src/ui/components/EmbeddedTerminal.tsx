import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const WS_BASE = 'ws://localhost:3743';

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

    const ws = new WebSocket(`${WS_BASE}/api/portgrid/terminal/${encodeURIComponent(projectId)}`);

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

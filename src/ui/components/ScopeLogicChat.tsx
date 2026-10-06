import React, { useState, useEffect } from 'react';
import { Minimize2, Maximize2 } from 'lucide-react';
import { useDeveloperMode } from './DeveloperModeContext';
import { useHardwareTier } from '../../core/scoutdaemon/hardware-context';
import { useNavigation } from '../layouts/OSLayout';

const API = 'http://localhost:3743';

export interface DAGProposalPayload {
  id: string;
  status: string;
  nodes: { id: string; dependencies: string[]; prompt: string }[];
}

interface ScopeLogicChatProps {
  onProposal?: (proposal: DAGProposalPayload) => void;
}

export function ScopeLogicChat({ onProposal }: ScopeLogicChatProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const hardwareTier = useHardwareTier();
  const { activeProjectId } = useNavigation();
  const isConstrained = hardwareTier === 'constrained';
  const [input,     setInput]     = useState('');
  const [chatLog,   setChatLog]   = useState<{role: string, content: string}[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [complete,  setComplete]  = useState(false);
  const [minimized, setMinimized] = useState(false);

  // §1.1 — Auto-minimize once the interview is done and a DAG has been emitted.
  useEffect(() => {
    if (complete) setMinimized(true);
  }, [complete]);

  const handleSend = async () => {
    if (!input.trim() || complete) return;

    const userMsg = input.trim();
    setChatLog(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      // Route through NeuroSync's own backend (ScopeLogic interview) — never a raw
      // LLM endpoint and never a hardcoded credential. The backend owns prompt
      // construction, provider routing (RouteSwitch), and per-project session state.
      const res = await fetch(`${API}/api/scopelogic/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, projectId: activeProjectId || null }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 429) throw new Error('Too Many Requests (429)');
        if (res.status >= 500) throw new Error(`Server Error (${res.status})`);
        throw new Error(`Network error: ${res.status} ${res.statusText}`);
      }

      // The endpoint answers with a single JSON object (not an SSE stream).
      const data = await res.json();
      const reply = data.reply || data.response || data.message || 'Acknowledged.';
      setChatLog(prev => [...prev, { role: 'system', content: reply }]);

      if (data.isComplete || data.ready || data.dagProposal) {
        const prop = data.dagProposal || data.proposal;
        if (prop && Array.isArray(prop.nodes)) {
          const proposal = { id: prop.id ?? crypto.randomUUID(), status: 'draft', nodes: prop.nodes };
          setComplete(true);
          onProposal?.(proposal);
        }
      }

    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      const simple = isTimeout 
        ? "Request timed out. Please check your local LLM connection." 
        : "Something went wrong sending that message. Please try again.";
        
      setChatLog(prev => [...prev, {
        role: 'system',
        content: isDeveloperMode ? `${simple} (Developer Mode: ${err.message})` : simple
      }]);
    } finally {
      setLoading(false);
    }
  };

  // §1.1 — Compact chip view; restores the full panel on click.
  if (minimized) {
    return (
      <div className={`${isConstrained ? 'solid-panel' : 'glass-panel'} animate-fade-in`} style={{
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        width: 'fit-content',
        maxWidth: '240px',
      }}
      onClick={() => setMinimized(false)}
      title="Expand interview panel"
      role="button"
      aria-label="Expand ScopeLogic interview panel"
      >
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)' }}>💬</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>
          {complete ? 'Interview complete' : 'ScopeLogic'}
        </span>
        <Maximize2 size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
      </div>
    );
  }

  return (
    <div className={`${isConstrained ? 'solid-panel' : 'glass-panel'} p-4 flex flex-col gap-4 animate-fade-in max-w-md w-full h-[400px]`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-accent">💬 ScopeLogic Interview</h2>
        <button
          className="btn-icon"
          onClick={() => setMinimized(true)}
          aria-label="Minimize ScopeLogic panel"
          title="Minimize"
        >
          <Minimize2 size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-2 bg-gray-900/30 rounded-md">
        {chatLog.length === 0 && (
          <div className="text-sm opacity-50 text-center mt-10">
            Tell me what workflow you want to build...
          </div>
        )}
        {chatLog.map((msg, i) => (
          <div key={i} className={`p-2 rounded-md text-sm ${msg.role === 'user' ? 'bg-primary/20 text-right ml-8' : 'bg-white/10 mr-8'}`}>
            <span className="font-bold block mb-1 opacity-70">{msg.role === 'user' ? 'You' : 'ScopeLogic'}</span>
            {msg.content}
          </div>
        ))}
        {loading && <div className="text-sm opacity-50 animate-pulse">Thinking...</div>}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          className="input-base flex-1"
          placeholder={complete ? "Interview complete ✓" : "I want to automate..."}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          disabled={complete}
        />
        <button className="btn-primary" onClick={handleSend} disabled={loading || complete}>
          {complete ? '✓' : 'Send'}
        </button>
      </div>
    </div>
  );
}

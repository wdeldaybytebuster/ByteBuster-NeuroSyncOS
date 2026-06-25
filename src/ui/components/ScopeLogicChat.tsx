import React, { useState, useEffect } from 'react';
import { Minimize2, Maximize2 } from 'lucide-react';

export interface DAGProposalPayload {
  id: string;
  status: string;
  nodes: { id: string; dependencies: string[]; prompt: string }[];
}

interface ScopeLogicChatProps {
  onProposal?: (proposal: DAGProposalPayload) => void;
}

export function ScopeLogicChat({ onProposal }: ScopeLogicChatProps) {
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

    try {
      const res = await fetch('http://localhost:3743/api/scopelogic/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();

      if (data.response) {
        setChatLog(prev => [...prev, { role: 'system', content: data.response }]);
      } else if (data.reply) {
        setChatLog(prev => [...prev, { role: 'system', content: data.reply }]);
      }

      if (data.dagProposal) {
        setComplete(true);
        setChatLog(prev => [...prev, {
          role: 'system',
          content: `✅ DAG Proposal Generated: ${data.dagProposal.nodes.length} tasks ready for review on the canvas.`
        }]);
        onProposal?.(data.dagProposal);
      }

    } catch (err: any) {
      setChatLog(prev => [...prev, { role: 'system', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // §1.1 — Compact chip view; restores the full panel on click.
  if (minimized) {
    return (
      <div className="glass-panel animate-fade-in" style={{
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
    <div className="glass-panel p-4 flex flex-col gap-4 animate-fade-in max-w-md w-full h-[400px]">
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

      <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-2 bg-black/20 rounded-md">
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

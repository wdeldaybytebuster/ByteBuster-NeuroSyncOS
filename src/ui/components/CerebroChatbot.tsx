import React, { useState, useRef, useEffect } from 'react';
import { useNavigation } from '../layouts/OSLayout';
import { Bot, Send, Minus, X, Navigation } from 'lucide-react';

const API = 'http://localhost:3743';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  suggestedNav?: string | null;
}

export function CerebroChatbot() {
  const { navigate } = useNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Welcome to NeuroSync. I\'m Cerebro, your system guide. Ask me anything about how to configure providers, start workflows, or navigate the OS.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/cerebro/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: messages.slice(-6) }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: data.reply,
          suggestedNav: data.suggestedNavigation,
        }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.error || 'Sorry, I encountered an error.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Network error. Please check that the backend server is running on port 3743.' }]);
    }
    setLoading(false);
  };

  const handleNavigate = (target: string) => {
    const moduleMap: Record<string, string> = {
      routeswitch: 'routeswitch',
      coreexec: 'coreexec',
      scopelogic: 'scopelogic',
      portgrid: 'portgrid',
      basevault: 'basevault',
      scoutdaemon: 'scoutdaemon',
      cerebro: 'cerebro',
      master: 'master',
    };
    const view = moduleMap[target.toLowerCase()];
    if (view) {
      navigate(view);
      setIsMinimized(true);
    }
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105"
        style={{
          background: 'linear-gradient(135deg, #8E24AA, #AB47BC)',
          boxShadow: '0 0 20px rgba(142,36,170,0.5), 0 4px 12px rgba(0,0,0,0.4)',
        }}
        aria-label="Open Cerebro Assistant"
      >
        <Bot size={24} className="text-white" />
      </button>
    );
  }

  // Minimized bar
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full border border-purple-500/30 backdrop-blur-md"
        style={{ background: 'rgba(20,5,30,0.9)', boxShadow: '0 0 15px rgba(142,36,170,0.3)' }}>
        <Bot size={16} className="text-purple-400" />
        <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Cerebro</span>
        <button onClick={() => setIsMinimized(false)} className="text-gray-400 hover:text-white ml-2 transition-colors"><span className="text-xs">Expand</span></button>
        <button onClick={() => { setIsOpen(false); setIsMinimized(false); }} className="text-gray-500 hover:text-red-400 transition-colors"><X size={14} /></button>
      </div>
    );
  }

  // Full chat panel
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] h-[480px] flex flex-col rounded-2xl border border-purple-500/20 overflow-hidden backdrop-blur-xl"
      style={{ background: 'rgba(10,3,18,0.95)', boxShadow: '0 0 30px rgba(142,36,170,0.25), 0 8px 32px rgba(0,0,0,0.6)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20" style={{ background: 'rgba(142,36,170,0.1)' }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" style={{ boxShadow: '0 0 6px #22c55e' }}></span>
          <span className="text-xs font-bold text-white uppercase tracking-wider">Cerebro Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMinimized(true)} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors" aria-label="Minimize"><Minus size={14} /></button>
          <button onClick={() => { setIsOpen(false); setIsMinimized(false); }} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors" aria-label="Close"><X size={14} /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
              m.role === 'user'
                ? 'bg-white/5 border border-white/10 text-white rounded-br-sm'
                : 'border border-purple-500/20 bg-purple-500/5 text-gray-200 rounded-bl-sm'
            }`}>
              {m.role === 'assistant' && (
                <div className="text-[9px] font-mono font-bold text-purple-400 uppercase tracking-widest mb-1">CEREBRO</div>
              )}
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
            {/* Navigation button if suggestion exists */}
            {m.role === 'assistant' && m.suggestedNav && (
              <button
                onClick={() => handleNavigate(m.suggestedNav!)}
                className="mt-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-all"
              >
                <Navigation size={10} /> Go to {m.suggestedNav.charAt(0).toUpperCase() + m.suggestedNav.slice(1)}
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-start">
            <div className="px-3 py-2 rounded-xl text-xs border border-purple-500/20 bg-purple-500/5 text-purple-300 rounded-bl-sm">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '0.4s' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-purple-500/20" style={{ background: 'rgba(142,36,170,0.05)' }}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Ask Cerebro anything..."
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50 placeholder-gray-600"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="p-2 rounded-lg transition-all disabled:opacity-30"
            style={{ backgroundColor: '#8E24AA' }}
            aria-label="Send message"
          >
            <Send size={14} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

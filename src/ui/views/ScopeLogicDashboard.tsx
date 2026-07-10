import React, { useState, useEffect, useRef } from 'react';
import { AppShell } from '../components/AppShell';
import { useNavigation } from '../layouts/OSLayout';
import { useDeveloperMode } from '../components/DeveloperModeContext';
import { ModeLabel } from '../components/ModeLabel';
import { HelpTip } from '../components/HelpTip';
import { MessageSquare, Container, AlertTriangle, Binary, FileText, Users, Shield, CheckCircle, XCircle, Send } from 'lucide-react';

const API = 'http://localhost:3743';
const ACCENT = '#00E5FF';

// Shared glow box (cyan glow — ScopeLogic uses the same stealth-cyan as CoreExec)
const GLOW_BOX = `bg-white/[0.02] border border-white/5 rounded-xl p-5 backdrop-blur-sm transition-all duration-300 shadow-[0_0_15px_rgba(0,229,255,0.08)] hover:shadow-[0_0_30px_rgba(0,229,255,0.2)] hover:border-[rgba(0,229,255,0.25)]`;

// ─── Dashboard View ─────────────────────────────────────────────────────────
function DashboardView() {
  const { activeProjectId, navigate } = useNavigation();
  const { isDeveloperMode } = useDeveloperMode();
  const [messages, setMessages] = useState<{role:string;text:string}[]>([
    { role: 'assistant', text: 'Welcome. Let us define your transactional workflow parameters. What is the primary objective of the workflow DAG we are building?' }
  ]);
  const [input, setInput] = useState('');
  const [round, setRound] = useState(1);
  const [isComplete, setIsComplete] = useState(false);
  const [proposal, setProposal] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load interview history on mount. Interview sessions are scoped per project
  // server-side, so pass the active project (nullable → the shared Global scope).
  useEffect(() => {
    const projectQuery = activeProjectId ? `?projectId=${encodeURIComponent(activeProjectId)}` : '';
    fetch(`${API}/api/scopelogic/history${projectQuery}`)
      .then(r => r.json())
      .then(data => {
        if (data.history && data.history.length > 0) {
          setMessages(data.history.map((m: any) => ({ role: m.role, text: m.content || m.text || '' })));
          setRound(Math.min(8, Math.ceil(data.history.length / 2) + 1));
          if (data.isComplete) {
            setIsComplete(true);
            // Check if there's a persisted proposal
            fetch(`${API}/api/system/proposals/pending`).then(r => r.json()).then(d => {
              if (d.success && d.proposal) setProposal(d.proposal);
            }).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, [activeProjectId]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Send interview message
  const handleSend = async () => {
    if (!input.trim() || isComplete) return;
    const msg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setInput('');
    try {
      const res = await fetch(`${API}/api/scopelogic/prompt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, projectId: activeProjectId || null })
      });
      const data = await res.json();
      const reply = data.reply || data.response || data.message || 'Acknowledged.';
      setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
      setRound(prev => Math.min(8, prev + 1));
      if (data.isComplete || data.ready || data.dagProposal) {
        setIsComplete(true);
        const prop = data.dagProposal || data.proposal;
        if (prop) {
          setProposal(prop);
          // Persist to backend so it survives navigation. Scope it to the
          // active project (nullable — "Global"/no active project is valid).
          await fetch(`${API}/api/system/proposals/stage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            // Forward the LLM's self-reported confidence when present; the server
            // defaults to 0.5 when it's absent (e.g. the template fallback path).
            body: JSON.stringify({ proposal: prop, projectId: activeProjectId || null, confidence: prop.confidence })
          }).catch(() => {});
          // Auto-navigate to PortGrid for visual review after a brief delay
          setTimeout(() => navigate('portgrid'), 1500);
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error: Could not reach ScopeLogic engine.' }]);
    }
  };

  // Reset interview
  const handleReset = async () => {
    await fetch(`${API}/api/scopelogic/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProjectId || null })
    }).catch(() => {});
    await fetch(`${API}/api/system/proposals/pending`, { method: 'DELETE' }).catch(() => {});
    setMessages([{ role: 'assistant', text: 'Interview reset. What is the primary objective of the workflow DAG we are building?' }]);
    setRound(1);
    setIsComplete(false);
    setProposal(null);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Widget A: Bounded Interview Pipeline */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <MessageSquare size={16} style={{ color: ACCENT }} /> <ModeLabel simple="Guided Project Interview" dev="Bounded Interview Pipeline" />
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5" style={{ color: ACCENT }}>Round {round} / 8</span>
            <button onClick={handleReset} className="text-[10px] font-bold text-gray-400 hover:text-white px-2 py-1 rounded border border-white/10 hover:border-white/20 transition-all">{isComplete ? '+ New Interview' : 'Reset'}</button>
          </div>
        </div>

        {/* Chat area */}
        <div className="bg-black/30 border border-white/5 rounded-lg p-4 h-[280px] overflow-y-auto space-y-3 mb-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-white/5 border border-white/10 text-white'
                  : 'border border-cyan-500/20 bg-cyan-500/5 text-gray-300'
              }`}>
                <div className="text-[9px] font-mono font-bold uppercase tracking-widest mb-1" style={{ color: m.role === 'user' ? '#9ca3af' : ACCENT }}>
                  {m.role === 'user' ? 'OPERATOR' : 'SCOPELOGIC'}
                </div>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            disabled={isComplete}
            placeholder={isComplete ? 'Interview complete — review proposal below' : 'Specify your requirements...'}
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
          />
          <button onClick={handleSend} disabled={isComplete} className="px-3 py-2 rounded-lg text-black font-bold text-xs disabled:opacity-30 transition-all" style={{ backgroundColor: ACCENT }}>
            <Send size={14} />
          </button>
        </div>
      </section>

      {/* Widget B: Draft Proposal Status */}
      <section className={GLOW_BOX}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Container size={16} style={{ color: ACCENT }} /> <ModeLabel simple="Your Draft Plan" dev="Draft Proposal Status" />
          </h2>
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400"><ModeLabel simple="Draft Only — You Approve" dev="Zero-Trust Staging" /></span>
        </div>

        {proposal ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
              <CheckCircle size={18} style={{ color: ACCENT }} />
              <div>
                <div className="text-xs font-bold text-white">Proposal Generated — Sent to PortGrid for Visual Review</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Navigate to PortGrid to see the workflow as a visual flowchart, make edits, and approve.</div>
              </div>
            </div>
            <button onClick={() => navigate('portgrid')} className="w-full px-4 py-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-xs font-bold flex items-center justify-center gap-2 hover:bg-cyan-500/20 transition-all" style={{ color: ACCENT }}>
              Open in PortGrid for Review →
            </button>
            {/* Collapsible raw JSON — only offered to users who've turned on Developer Mode */}
            {isDeveloperMode ? (
              <details className="mt-2">
                <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">Show raw JSON (technical view)</summary>
                <div className="bg-black/40 border border-white/5 rounded-lg p-3 mt-2 font-mono text-[9px] text-cyan-400 max-h-[150px] overflow-y-auto">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(proposal, null, 2)}</pre>
                </div>
              </details>
            ) : (
              <div className="text-[10px] text-gray-600 mt-2">
                Turn on Developer Mode (top-right icon) to see the technical details behind this plan.
              </div>
            )}
          </div>
        ) : (
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 font-mono text-[10px] text-gray-500 text-center">
            Complete the interview above to generate a workflow proposal. It will be sent to PortGrid for visual review.
          </div>
        )}
      </section>

      {/* Widget C: Draft Validation Status */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <AlertTriangle size={16} className="text-amber-400" /> <ModeLabel simple="Risk Check" dev="Draft Validation Status" />
        </h2>

        <div className="space-y-3">
          {/* This is a binary safety-validation status, not a multi-model
              consensus score. DAG proposals are now LLM-driven and DO carry a
              real model self-reported confidence (surfaced in the review/Deference
              queue via dag_proposals.confidence), but ValidatorLogic.validate()
              remains the gate shown here: a proposal only ever reaches this
              component once it has already passed that check (a failed check
              returns a chat message instead, never a dagProposal — on either the
              LLM path or the template fallback), so this status is a real fact,
              not a fabricated one. */}
          {proposal ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <CheckCircle size={14} className="text-green-400" />
              <span className="text-[10px] text-green-400 font-bold"><ModeLabel simple="Passed the safety check. No problems found." dev="Draft passed safety validation. No behavioral assertion violations detected." /></span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/5">
              <span className="text-[10px] text-gray-500 font-bold">No draft proposal yet — complete the interview above.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Set-up View ────────────────────────────────────────────────────────────
function SetupView() {
  const [grammarEnabled, setGrammarEnabled] = useState(true);
  const [rationaleFirst, setRationaleFirst] = useState(true);
  const [thinkingTokens, setThinkingTokens] = useState(false);
  const [maxDisagreement, setMaxDisagreement] = useState(0.25);
  const [highStakesThreshold, setHighStakesThreshold] = useState(70);
  const [saving, setSaving] = useState(false);
  const [promptLastModifiedMs, setPromptLastModifiedMs] = useState<number | null>(null);

  // Real last-modified timestamp of the system prompt file — there is no
  // version number or CI-gated test count for it (SYSTEM_PROMPT is a plain
  // string constant in interview.ts), so this is the one honest fact
  // available in place of the fabricated "v3.2.1" / "PASSING (398 tests)".
  useEffect(() => {
    fetch(`${API}/api/scopelogic/prompt-info`)
      .then(r => r.json())
      .then(data => { if (typeof data.lastModifiedMs === 'number') setPromptLastModifiedMs(data.lastModifiedMs); })
      .catch(() => {});
  }, []);

  // Safety assertions (locked vs toggleable). The locked SA-* rows are
  // mandatory Category A boundaries hardcoded permanently-on in
  // ValidatorLogic.validate() — they are never persisted as settings, the
  // checkbox is disabled, and this local `enabled: true` is purely cosmetic.
  // The SI-*/QR-01 rows ARE real settings: each maps to a
  // `scopelogic_assertion_<code>_enabled` key that ValidatorLogic.validate()
  // reads live on every call (validator.ts). Default `false` here matches the
  // validator's own permissive default for a key that's never been saved —
  // an unvisited Set-up screen must not silently claim a check is "on" when
  // nothing has actually persisted that yet.
  const [assertions, setAssertions] = useState({
    'SA-01': { label: 'Explanations SQL Block', locked: true, enabled: true },
    'SA-02': { label: 'Executive Code Quarantine', locked: true, enabled: true },
    'SA-04': { label: 'Node Category Sanity (no shell/exec)', locked: true, enabled: true },
    'SA-06': { label: 'No Self-Modification', locked: true, enabled: true },
    'SI-01': { label: 'Output shape validity (JSON)', locked: false, enabled: false },
    'SI-03': { label: 'Explanation non-empty', locked: false, enabled: false },
    'SI-05': { label: 'Confidence above minimum', locked: false, enabled: false },
    'QR-01': { label: 'Reasoning key present', locked: false, enabled: false },
  });

  // Maps a toggleable assertion's dashboard code to its system_settings key
  // (must match validator.ts's SI_01_KEY/SI_03_KEY/SI_05_KEY/QR_01_KEY).
  const ASSERTION_SETTING_KEY: Record<string, string> = {
    'SI-01': 'scopelogic_assertion_si01_enabled',
    'SI-03': 'scopelogic_assertion_si03_enabled',
    'SI-05': 'scopelogic_assertion_si05_enabled',
    'QR-01': 'scopelogic_assertion_qr01_enabled',
  };

  // Load settings
  useEffect(() => {
    fetch(`${API}/api/system/settings`).then(r => r.json()).then(d => {
      if (d.success && d.settings) {
        if (d.settings.grammar_constrained !== undefined) setGrammarEnabled(d.settings.grammar_constrained === 'true' || d.settings.grammar_constrained === true);
        if (d.settings.max_disagreement) setMaxDisagreement(Number(d.settings.max_disagreement));
        if (d.settings.high_stakes_threshold) setHighStakesThreshold(Number(d.settings.high_stakes_threshold));
        setAssertions(prev => {
          const next = { ...prev };
          for (const code of Object.keys(ASSERTION_SETTING_KEY)) {
            const key = ASSERTION_SETTING_KEY[code]!;
            const raw = d.settings[key];
            if (raw !== undefined) {
              next[code as keyof typeof next] = { ...next[code as keyof typeof next], enabled: raw === 'true' || raw === true };
            }
          }
          return next;
        });
      }
    }).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const assertionPayload: Record<string, boolean> = {};
      for (const code of Object.keys(ASSERTION_SETTING_KEY)) {
        assertionPayload[ASSERTION_SETTING_KEY[code]!] = assertions[code as keyof typeof assertions].enabled;
      }
      await fetch(`${API}/api/system/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grammar_constrained: grammarEnabled, rationale_first: rationaleFirst, thinking_tokens: thinkingTokens, max_disagreement: maxDisagreement, high_stakes_threshold: highStakesThreshold, ...assertionPayload })
      });
    } catch {}
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Control A: Grammar-Constrained Decoding */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Binary size={16} style={{ color: ACCENT }} /> <ModeLabel simple="AI Answer Format Rules" dev="Grammar-Constrained Decoding" />
        </h2>
        <p className="text-xs text-gray-400 mb-4"><ModeLabel simple="Rules that keep the AI's answers in a structure the app can reliably read." dev="Enforce strict syntactic output shapes. Rationale-First injection forces the model to reason before syntax clamps down." /></p>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block"><ModeLabel simple="Force AI to answer in a strict format" dev="GBNF Grammar Enforcement" /></span><span className="text-[10px] text-gray-500"><ModeLabel simple="Keeps AI answers in a predictable structure so the app can always read them" dev="Force valid JSON output via logit masking" /></span></div>
            <input type="checkbox" checked={grammarEnabled} onChange={e => setGrammarEnabled(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block"><ModeLabel simple="Make the AI explain its thinking first" dev="Rationale-First Schema Injection" /></span><span className="text-[10px] text-gray-500"><ModeLabel simple="The AI writes its reasoning before its answer, which improves quality" dev='Force "reasoning" as first JSON key before strict syntax' /></span></div>
            <input type="checkbox" checked={rationaleFirst} onChange={e => setRationaleFirst(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
          <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:border-white/10 transition-all">
            <div><span className="text-xs font-bold text-white block">Suppress Thinking Tokens</span><span className="text-[10px] text-gray-500">Pass enable_thinking=False to prevent proprietary token crashes</span></div>
            <input type="checkbox" checked={thinkingTokens} onChange={e => setThinkingTokens(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: ACCENT }} />
          </label>
        </div>
      </section>

      {/* Control B: System Prompt Governance */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <FileText size={16} style={{ color: ACCENT }} /> <ModeLabel simple="AI Instructions Version" dev="System Prompt Governance & Versioning" />
        </h2>
        <p className="text-xs text-gray-400 mb-4"><ModeLabel simple="Tracks the version of the core instructions the AI follows." dev="There is no version-numbering or CI test gate on the system prompt yet — this shows when the file itself last changed." /></p>

        <div className="bg-black/30 border border-white/5 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 font-bold">Last Modified</span>
            <span className="text-[10px] font-mono text-gray-500">
              {promptLastModifiedMs ? new Date(promptLastModifiedMs).toLocaleString() : '—'}
            </span>
          </div>
        </div>
      </section>

      {/* Control C: Multi-Model Consensus Tuning */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Users size={16} style={{ color: ACCENT }} /> <ModeLabel simple="Multi-AI Double-Check" dev="Multi-Model Consensus (Council Mode)" /> <HelpTip text="For important decisions, the app can ask several AI models the same question and compare their answers. If they disagree too much, it stops and asks you." />
        </h2>
        <p className="text-xs text-gray-400 mb-4"><ModeLabel simple="When a decision matters, ask multiple AI models and compare their answers before trusting the result." dev="Configure when ScopeLogic dispatches to parallel expert models for verification." /></p>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">High-Stakes Threshold (triggers Council)</span>
              <span className="font-mono font-bold" style={{ color: ACCENT }}>{highStakesThreshold}%</span>
            </div>
            <input type="range" min={50} max={100} value={highStakesThreshold} onChange={e => setHighStakesThreshold(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>50% (Aggressive)</span><span>100% (Never)</span></div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-bold">Max Disagreement Score (auto-halt)</span>
              <span className="font-mono font-bold" style={{ color: ACCENT }}>{maxDisagreement.toFixed(2)}</span>
            </div>
            <input type="range" min={0.1} max={0.8} step={0.05} value={maxDisagreement} onChange={e => setMaxDisagreement(+e.target.value)} className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer border border-white/10" style={{ accentColor: ACCENT }} />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1"><span>0.10 (Strict)</span><span>0.80 (Permissive)</span></div>
          </div>
        </div>
      </section>

      {/* Control D: Behavioral Assertion Framework */}
      <section className={GLOW_BOX}>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
          <Shield size={16} className="text-amber-400" /> <ModeLabel simple="Safety Rules" dev="Behavioral Assertion Framework" />
        </h2>
        <p className="text-xs text-gray-400 mb-4"><ModeLabel simple="Rules every AI plan is checked against. The critical ones are always on and can't be turned off; the quality ones are up to you." dev="Toggle validation rules. Critical safety assertions (SA-*) are locked mandatory. Quality regressions (SI-*, QR-*) are toggleable." /></p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(assertions).map(([code, rule]) => (
            <label key={code} className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
              rule.locked ? 'bg-green-500/5 border-green-500/20' : 'bg-white/[0.02] border-white/5 hover:border-white/10'
            }`}>
              <div className="flex items-center gap-2">
                {rule.locked ? <Shield size={12} className="text-green-400" /> : <CheckCircle size={12} className="text-gray-500" />}
                <div>
                  <span className="text-[10px] font-mono font-bold" style={{ color: rule.locked ? '#22c55e' : '#9ca3af' }}>{code}</span>
                  <span className="text-[10px] text-gray-400 ml-2">{rule.label}</span>
                </div>
              </div>
              <input
                type="checkbox" checked={rule.enabled}
                disabled={rule.locked}
                onChange={e => setAssertions(prev => ({ ...prev, [code]: { ...prev[code as keyof typeof prev], enabled: e.target.checked } }))}
                className="w-3.5 h-3.5 rounded disabled:opacity-50" style={{ accentColor: ACCENT }}
              />
            </label>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={saveSettings} disabled={saving} className="px-6 py-2.5 rounded-lg text-black font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          {saving ? 'Saving...' : 'Commit Configuration'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export function ScopeLogicDashboard() {
  const [activeView, setActiveView] = useState<'dashboard' | 'setups'>('dashboard');

  return (
    <AppShell
      moduleId="scopelogic"
      moduleName="ScopeLogic"
      moduleLogo="/SCOPELOGICLogo.png"
      accentColor={ACCENT}
      activeView={activeView}
      onViewChange={setActiveView}
    >
      {activeView === 'dashboard' ? <DashboardView /> : <SetupView />}
    </AppShell>
  );
}

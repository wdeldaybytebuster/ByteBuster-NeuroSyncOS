'use client';

import AutonomyDials from '@/components/AutonomyDials';
import DeferenceUI from '@/components/DeferenceUI';
import ProjectManager from '@/components/ProjectManager';
import SettingsModal from '@/components/SettingsModal';
import { useState } from 'react';

export default function Home() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const dummyTasks = [
    { id: '1', description: 'Resolve import paths in src/core/scoutlogic/cerebro-assist.test.ts', confidence: 99 },
    { id: '2', description: 'Apply non-null assertion to availableModels in dynamic-router.ts', confidence: 97 },
    { id: '3', description: 'Change parameter type to string in CerebroVectorStore.search', confidence: 95 },
  ];

  return (
    <main className="min-h-screen bg-black text-white selection:bg-emerald-500/30 p-8">
      <div className="max-w-7xl mx-auto space-y-12 relative">
        <header className="flex justify-between items-center border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-light tracking-tight">PortGrid <span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500">Cockpit</span></h1>
            <p className="text-sm text-zinc-500 mt-1">Next.js Autonomous Agent Dashboard</p>
          </div>
          <div className="flex gap-4 items-center">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded-full text-xs font-medium hover:bg-zinc-700 transition-colors border border-white/10"
            >
              Settings
            </button>
            <span className="flex items-center gap-2 text-xs font-medium px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              CoreExec Online
            </span>
            <span className="flex items-center gap-2 text-xs font-medium px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-full border border-cyan-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
              Telemetry Sync
            </span>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <ProjectManager />
            
            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl h-[400px] flex items-center justify-center">
              <p className="text-zinc-600 italic">Directed Acyclic Graph (DAG) Visualization Pipeline</p>
            </div>
            
            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-white mb-4">Task Queue (Deference UI Example)</h3>
              <ul className="space-y-3">
                {dummyTasks.map((t) => (
                  <li key={t.id} className="flex justify-between items-center bg-zinc-800/50 p-4 rounded-xl border border-white/5">
                    <span className="text-sm text-zinc-300">{t.description}</span>
                    <span className="text-xs font-mono text-emerald-400">{t.confidence}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-6">
            <AutonomyDials />
            
            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl h-64 flex flex-col justify-between">
              <h3 className="text-lg font-semibold text-white">Metrics / Telemetry</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-800/50 p-4 rounded-xl border border-white/5">
                  <div className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Heap Usage</div>
                  <div className="text-xl font-mono text-cyan-400">42.7 MB</div>
                </div>
                <div className="bg-zinc-800/50 p-4 rounded-xl border border-white/5">
                  <div className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1">Req / Min</div>
                  <div className="text-xl font-mono text-emerald-400">14</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Global Action Ambient Approvals (Deference UI) */}
        <DeferenceUI 
          tasks={dummyTasks} 
          onApproveAll={(ids) => console.log('Approved:', ids)} 
          onRejectAll={(ids) => console.log('Rejected:', ids)} 
        />
        
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </div>
    </main>
  );
}

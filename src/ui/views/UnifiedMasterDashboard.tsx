import React from 'react';
import { NotificationCenter } from '../components/NotificationCenter';
import { GovernorUI } from '../components/GovernorUI';
import { RunHistory } from '../components/RunHistory';
import { AgentKPIStrip } from '../components/AgentKPIStrip';
import { CronSummary } from '../components/CronSummary';
import { CerebroHealthWidget } from '../components/CerebroHealthWidget';
import { AutonomyDials } from '../components/AutonomyDials';
import { ProjectManager } from '../components/ProjectManager';
import { Globe, Activity, Cpu, Folder } from 'lucide-react';

export function UnifiedMasterDashboard({ onNavigate }: { onNavigate?: (view: string) => void }) {
  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8 animate-fade-in pb-24 relative z-10">

      {/* Premium Header */}
      <header className="relative flex flex-col gap-2 pb-6 border-b border-white/10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-neural-blue/10 rounded-full blur-[100px] -z-10 pointer-events-none"></div>
        <h1 className="text-4xl font-heading font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500 flex items-center gap-4">
          <Globe className="text-sovereign-gold drop-shadow-glow-gold" size={36} />
          Global Orchestration
        </h1>
        <p className="text-sm tracking-widest uppercase text-sterling-silver/60 font-mono flex items-center gap-2">
          <Activity size={14} className="text-report-green" /> System Overview & Real-Time Health
        </p>
      </header>

      {/* §3.1 — Top KPI Strip: live agent fan-out via SSE */}
      <section aria-label="Agent KPIs" className="glass-enclave rounded-xl p-4 shadow-2xl">
        <AgentKPIStrip />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-8">

          {/* Action Center (existing NotificationCenter) */}
          <div className="glass-enclave rounded-xl p-1 shadow-2xl transition-all duration-300 hover:border-white/20">
            <div className="bg-gunmetal/40 p-6 rounded-lg h-full flex flex-col gap-4">
              <h3 className="font-heading font-bold text-lg text-foreground border-b border-white/10 pb-3 flex items-center gap-2">
                <Activity size={18} className="text-sovereign-gold" /> Action Center
              </h3>
              <NotificationCenter />
            </div>
          </div>

          {/* RouteSwitch (Governor) */}
          <div className="glass-enclave rounded-xl p-1 shadow-glow-amber transition-all duration-300 hover:shadow-[0_0_45px_-10px_rgba(255,179,0,0.8)]">
            <div className="bg-gunmetal/60 p-6 rounded-lg h-full flex flex-col gap-5">
              <h3 className="font-heading font-bold text-lg text-route-switch border-b border-route-switch/20 pb-3 flex items-center gap-2">
                <img src="/ROUTESWITCHLogo.png" alt="RouteSwitch Logo" className="w-5 h-5 object-contain drop-shadow-glow-amber" /> RouteSwitch
              </h3>
              <div className="bg-void/50 rounded-lg p-4 border border-white/5">
                <GovernorUI />
              </div>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('routeswitch')}
                  className="mt-2 w-full text-center text-xs font-bold tracking-widest uppercase text-route-switch hover:text-foreground py-3 border border-route-switch/30 rounded bg-route-switch/10 hover:bg-route-switch/30 transition-all duration-300 shadow-glass-inner"
                >
                  Manage Traffic & Quotas &rarr;
                </button>
              )}
            </div>
          </div>

          {/* CoreExec Engine */}
          <div className="glass-enclave rounded-xl p-1 shadow-glow-blue transition-all duration-300 hover:shadow-[0_0_45px_-10px_rgba(0,229,255,0.8)]">
            <div className="bg-gunmetal/60 p-6 rounded-lg h-full flex flex-col gap-5">
              <h3 className="font-heading font-bold text-lg text-core-exec border-b border-core-exec/20 pb-3 flex items-center gap-2">
                <img src="/COREEXECLogo.png" alt="CoreExec Logo" className="w-5 h-5 object-contain drop-shadow-glow-blue" /> CoreExec Engine
              </h3>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('coreexec')}
                  className="mt-2 w-full text-center text-xs font-bold tracking-widest uppercase text-core-exec hover:text-foreground py-3 border border-core-exec/30 rounded bg-core-exec/10 hover:bg-core-exec/30 transition-all duration-300 shadow-glass-inner"
                >
                  Manage CoreExec Fleet &rarr;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-8">

          {/* Project Manager */}
          <div className="glass-enclave rounded-xl p-1 shadow-glow-amber transition-all duration-300">
            <div className="bg-gunmetal/60 p-6 rounded-lg h-full flex flex-col gap-5">
              <h3 className="font-heading font-bold text-lg text-foreground border-b border-white/10 pb-3 flex items-center gap-2">
                <Folder size={18} className="text-sovereign-gold drop-shadow-glow-amber" /> Workspace Provisioning
              </h3>
              <ProjectManager />
            </div>
          </div>

          {/* §3.1 — Cerebro Health */}
          <div className="glass-enclave rounded-xl p-1 shadow-glow-blue transition-all duration-300">
            <div className="bg-gunmetal/60 p-6 rounded-lg h-full flex flex-col gap-5">
              <h3 className="font-heading font-bold text-lg text-neural-blue border-b border-neural-blue/20 pb-3">
                Memory Substrate
              </h3>
              <CerebroHealthWidget />
            </div>
          </div>

          {/* Autonomy Configuration */}
          <div className="glass-enclave rounded-xl p-1 shadow-glow-amber transition-all duration-300 hover:shadow-[0_0_45px_-10px_rgba(251,191,36,0.5)]">
            <div className="bg-gunmetal/60 p-6 rounded-lg h-full flex flex-col gap-5">
              <h3 className="font-heading font-bold text-lg text-foreground border-b border-white/10 pb-3 flex items-center gap-2">
                Autonomy Configuration
              </h3>
              <AutonomyDials />
            </div>
          </div>

          {/* §3.1 — Cron Summary */}
          <div className="glass-enclave rounded-xl p-1 shadow-glow-amber transition-all duration-300 hover:shadow-[0_0_45px_-10px_rgba(255,179,0,0.8)]">
            <div className="bg-gunmetal/60 p-6 rounded-lg h-full flex flex-col gap-5">
              <h3 className="font-heading font-bold text-lg text-route-switch border-b border-route-switch/20 pb-3 flex items-center gap-2">
                <Cpu size={18} className="text-route-switch drop-shadow-glow-amber" /> Scheduled Workflows
              </h3>
              <CronSummary />
            </div>
          </div>

          {/* Execution Ledger */}
          <div className="glass-enclave rounded-xl p-1 shadow-2xl transition-all">
            <div className="bg-gunmetal/40 p-6 rounded-lg h-full flex flex-col gap-4">
              <h3 className="font-heading font-bold text-lg text-foreground border-b border-white/10 pb-3">
                Execution Ledger
              </h3>
              <div className="h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                <RunHistory />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

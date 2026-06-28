import AutonomyDials from '@/components/AutonomyDials';
import ProjectManager from '@/components/ProjectManager';
import HeaderActions from '@/components/HeaderActions';
import TaskQueue from '@/components/TaskQueue';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-12 relative">
        <header className="flex justify-between items-center border-b border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-heading font-light tracking-tight">NeuroSync <span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--color-sovereign-gold)] to-[var(--color-port-grid)]">Cockpit</span></h1>
            <p className="text-sm opacity-70 mt-1">Sovereign OS Autonomous Agent Dashboard</p>
          </div>
          <div className="flex gap-4 items-center">
            <HeaderActions />
            <span className="flex items-center gap-2 text-xs font-medium px-4 py-2 glass-enclave dynamic-interactive rounded-full">
              <span className="w-2 h-2 rounded-full bg-[var(--color-core-exec)] animate-pulse shadow-[var(--shadow-glow-cyan)]"></span>
              CoreExec Online
            </span>
            <span className="flex items-center gap-2 text-xs font-medium px-4 py-2 glass-enclave dynamic-interactive rounded-full">
              <span className="w-2 h-2 rounded-full bg-[var(--color-neural-blue)] animate-pulse shadow-[var(--shadow-glow-blue)]"></span>
              Telemetry Sync
            </span>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <ProjectManager />
            
            <div className="glass-enclave dynamic-interactive rounded-2xl p-6 h-[400px] flex items-center justify-center">
              <p className="opacity-50 italic">Directed Acyclic Graph (DAG) Visualization Pipeline</p>
            </div>
            
            <TaskQueue />
          </div>

          <div className="space-y-6">
            <AutonomyDials />
            
            <div className="glass-enclave dynamic-interactive rounded-2xl p-6 h-64 flex flex-col justify-between">
              <h3 className="text-lg font-heading font-semibold">Metrics / Telemetry</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[var(--bg-dots)] p-4 rounded-xl border border-[var(--color-glass-border)] transition hover:bg-[var(--color-glass-border)]">
                  <div className="text-xs opacity-60 uppercase font-bold tracking-wider mb-1">Heap Usage</div>
                  <div className="text-xl font-mono text-[var(--color-core-exec)]">42.7 MB</div>
                </div>
                <div className="bg-[var(--bg-dots)] p-4 rounded-xl border border-[var(--color-glass-border)] transition hover:bg-[var(--color-glass-border)]">
                  <div className="text-xs opacity-60 uppercase font-bold tracking-wider mb-1">Req / Min</div>
                  <div className="text-xl font-mono text-[var(--color-report-green)]">14</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

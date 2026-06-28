import React, { useEffect, useState } from 'react';
import { Globe, Folder, Plus, X } from 'lucide-react';
import { useNavigation } from '../layouts/OSLayout';

const API = 'http://localhost:3743';

interface Project {
  id: string;
  name: string;
  workspace_path?: string;
  created_at: number;
}

export function ProjectSwitcher() {
  const { activeProjectId, activeProjectName, setActiveProject } = useNavigation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchProjects = () => {
    fetch(`${API}/api/projects`)
      .then(r => r.json())
      .then(data => { if (data.projects) setProjects(data.projects); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      });
      const data = await res.json();
      if (data.success && data.project) {
        setProjects(prev => [data.project, ...prev]);
        setActiveProject(data.project.id, data.project.name);
        setNewName('');
        setShowCreate(false);
      }
    } catch {}
    setCreating(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Current Filter Display */}
      <div className="p-4 border-b border-white/5">
        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">Active Filter</div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          {activeProjectId ? <Folder size={14} className="text-amber-400" /> : <Globe size={14} className="text-green-400" />}
          <span className="text-sm font-bold text-white">{activeProjectName}</span>
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Global Option */}
        <button
          onClick={() => setActiveProject(null, 'Global')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
            !activeProjectId ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          <Globe size={15} />
          <span className="font-semibold">Global (All Projects)</span>
          {!activeProjectId && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>}
        </button>

        {/* Separator */}
        <div className="h-px bg-white/5 my-2"></div>

        {/* Projects from backend */}
        {loading ? (
          <div className="text-xs text-gray-500 px-3 py-4 text-center font-mono">Loading workspaces...</div>
        ) : projects.length === 0 ? (
          <div className="text-xs text-gray-500 px-3 py-4 text-center">No projects yet. Create one below.</div>
        ) : (
          projects.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveProject(p.id, p.name)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                activeProjectId === p.id ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Folder size={15} />
              <span className="font-semibold truncate">{p.name}</span>
              {activeProjectId === p.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>}
            </button>
          ))
        )}
      </div>

      {/* New Project Creator — anchored at bottom */}
      <div className="p-3 border-t border-white/5 space-y-2">
        {showCreate ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">New Workspace</span>
              <button onClick={() => { setShowCreate(false); setNewName(''); }} className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10"><X size={12} /></button>
            </div>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Project name..."
              autoFocus
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="w-full px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs hover:bg-amber-500/30 transition-all disabled:opacity-40"
            >
              {creating ? 'Creating...' : 'Create & Switch'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-white/10 text-gray-400 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all text-xs font-semibold"
          >
            <Plus size={14} /> New Workspace
          </button>
        )}
        <div className="text-[9px] font-mono text-gray-600 text-center">
          Workspace isolation enforced via row-level scoping
        </div>
      </div>
    </div>
  );
}

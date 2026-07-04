import React, { useEffect, useState } from 'react';
import { Globe, Folder, Plus, X, FolderOpen, Pencil, Archive } from 'lucide-react';
import { useNavigation } from '../layouts/OSLayout';
import { PathBrowser } from './PathBrowser';

const API = 'http://localhost:3743';

interface Project {
  id: string;
  name: string;
  workspace_path?: string;
  project_root_path?: string | null;
  created_at: number;
}

export function ProjectSwitcher() {
  const { activeProjectId, activeProjectName, setActiveProject } = useNavigation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRootPath, setNewRootPath] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRootPath, setEditRootPath] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Path browser state
  const [showPathBrowser, setShowPathBrowser] = useState(false);
  const [pathBrowserTarget, setPathBrowserTarget] = useState<'create' | 'edit'>('create');

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
    setCreateError('');
    try {
      const res = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), projectRootPath: newRootPath.trim() || undefined })
      });
      const data = await res.json();
      if (data.success && data.project) {
        setProjects(prev => [data.project, ...prev]);
        setActiveProject(data.project.id, data.project.name);
        setNewName('');
        setNewRootPath('');
        setShowCreate(false);
      } else {
        setCreateError(data.error || 'Failed to create project');
      }
    } catch { setCreateError('Network error'); }
    setCreating(false);
  };

  const handleStartEdit = (p: Project) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditRootPath(p.project_root_path || '');
    setEditError('');
  };

  const handleArchive = async (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Archive "${p.name}"? It will disappear from this list but its data isn't deleted.`)) return;
    try {
      const res = await fetch(`${API}/api/projects/${p.id}/archive`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setProjects(prev => prev.filter(proj => proj.id !== p.id));
        if (activeProjectId === p.id) setActiveProject(null, 'Global');
      }
    } catch { /* leave the row in place; user can retry */ }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`${API}/api/projects/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), projectRootPath: editRootPath.trim() || null })
      });
      const data = await res.json();
      if (data.success && data.project) {
        setProjects(prev => prev.map(p => p.id === editingId ? data.project : p));
        setEditingId(null);
      } else {
        setEditError(data.error || 'Failed to update');
      }
    } catch { setEditError('Network error'); }
    setEditSaving(false);
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
            <div key={p.id} className="group">
              {editingId === p.id ? (
                /* Inline Edit Form */
                <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2">
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50" placeholder="Project name" />
                  <div className="flex items-center gap-1">
                    <FolderOpen size={11} className="text-amber-400 shrink-0" />
                    <input type="text" value={editRootPath} onChange={e => setEditRootPath(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-amber-500/50" placeholder="/absolute/path/to/project" />
                    <button onClick={() => { setPathBrowserTarget('edit'); setShowPathBrowser(true); }} className="px-1.5 py-1.5 rounded border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all" title="Browse">
                      <Folder size={10} />
                    </button>
                  </div>
                  {editError && <div className="text-[9px] text-red-400">{editError}</div>}
                  <div className="flex gap-1.5">
                    <button onClick={handleSaveEdit} disabled={editSaving} className="flex-1 px-2 py-1 rounded bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold disabled:opacity-40">{editSaving ? 'Saving...' : 'Save'}</button>
                    <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded border border-white/10 text-gray-400 text-[10px] font-bold hover:text-white">Cancel</button>
                  </div>
                </div>
              ) : (
                /* Normal project row */
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveProject(p.id, p.name)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveProject(p.id, p.name); } }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer ${
                    activeProjectId === p.id ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Folder size={15} />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="font-semibold truncate block">{p.name}</span>
                    {p.project_root_path && <span className="text-[9px] font-mono text-gray-600 truncate block">{p.project_root_path}</span>}
                  </div>
                  {activeProjectId === p.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0"></span>}
                  <button onClick={(e) => { e.stopPropagation(); handleStartEdit(p); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-all shrink-0" aria-label="Edit project">
                    <Pencil size={11} />
                  </button>
                  <button onClick={(e) => handleArchive(p, e)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-500 hover:text-red-400 transition-all shrink-0" aria-label="Archive project" title="Archive project">
                    <Archive size={11} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New Project Creator — anchored at bottom */}
      <div className="p-3 border-t border-white/5 space-y-2">
        {showCreate ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">New Workspace</span>
              <button onClick={() => { setShowCreate(false); setNewName(''); setNewRootPath(''); setCreateError(''); }} className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10"><X size={12} /></button>
            </div>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Project name..."
              autoFocus
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
            />
            <div className="flex items-center gap-1.5">
              <FolderOpen size={12} className="text-amber-400 shrink-0" />
              <input
                type="text"
                value={newRootPath}
                onChange={e => setNewRootPath(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="/absolute/path/to/source (optional)"
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[10px] font-mono text-white focus:outline-none focus:border-amber-500/50"
              />
              <button onClick={() => { setPathBrowserTarget('create'); setShowPathBrowser(true); }} className="px-2 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all" title="Browse">
                <Folder size={12} />
              </button>
            </div>
            {createError && <div className="text-[9px] text-red-400 font-mono">{createError}</div>}
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

      <PathBrowser
        isOpen={showPathBrowser}
        onClose={() => setShowPathBrowser(false)}
        onSelect={(p) => { if (pathBrowserTarget === 'create') setNewRootPath(p); else setEditRootPath(p); }}
        mode="directory"
        title="Select Project Root Directory"
      />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Folder, Plus, Code } from 'lucide-react';

export function ProjectManager() {
  const [projects, setProjects] = useState<any[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data.projects) setProjects(data.projects);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch projects', err);
        setLoading(false);
      });
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const optimisticId = `temp-${Date.now()}`;
    const optimisticProject = {
      id: optimisticId,
      name: newProjectName,
      workspace_path: 'Provisioning...',
      created_at: Date.now(),
      status: 'creating'
    };

    // Optimistic update
    setProjects(prev => [optimisticProject, ...prev]);
    const nameToSubmit = newProjectName;
    setNewProjectName('');

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameToSubmit })
      });
      const data = await res.json();

      if (data.success && data.project) {
        setProjects(prev => prev.map(p => p.id === optimisticId ? data.project : p));
      } else {
        // Revert on error
        setProjects(prev => prev.filter(p => p.id !== optimisticId));
        console.error('Failed to create project:', data.error);
      }
    } catch (err) {
      // Revert on error
      setProjects(prev => prev.filter(p => p.id !== optimisticId));
      console.error('Network error creating project:', err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCreateProject} className="flex gap-2">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          placeholder="New Project Name..."
          className="input-base"
        />
        <button
          type="submit"
          disabled={!newProjectName.trim()}
          className="bg-sovereign-gold/20 hover:bg-sovereign-gold/40 text-sovereign-gold border border-sovereign-gold/30 px-4 py-2 rounded text-sm font-bold tracking-wider uppercase transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Plus size={16} /> Create
        </button>
      </form>

      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
        {loading ? (
          <div className="text-white/50 text-sm text-center py-4">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-white/50 text-sm text-center py-4">No projects provisioned.</div>
        ) : (
          projects.map(p => (
            <div key={p.id} className={`bg-gunmetal/40 border ${p.status === 'creating' ? 'border-dashed border-sovereign-gold/50 opacity-70' : 'border-white/5'} rounded p-3 flex flex-col gap-1`}>
              <div className="flex items-center gap-2 text-white font-medium">
                <Folder size={14} className="text-neural-blue" />
                {p.name}
                {p.status === 'creating' && <span className="ml-auto text-xs text-sovereign-gold animate-pulse">Provisioning...</span>}
              </div>
              <div className="text-xs text-white/40 flex items-center gap-2 break-all">
                <Code size={12} className="min-w-3" /> {p.workspace_path}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

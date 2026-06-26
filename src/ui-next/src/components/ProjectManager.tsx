'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Folder, Loader2 } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export default function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setProjects(data);
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

    const optimisticProject: Project = {
      id: `temp-${Date.now()}`,
      name: newProjectName,
      createdAt: new Date().toISOString(),
    };

    setProjects(prev => [optimisticProject, ...prev]);
    setNewProjectName('');
    setIsCreating(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: optimisticProject.name }),
      });
      
      if (!res.ok) throw new Error('Failed to create');
      const createdProject = await res.json();
      
      setProjects(prev => prev.map(p => p.id === optimisticProject.id ? createdProject : p));
    } catch (err) {
      console.error('Failed to create project', err);
      // Revert optimistic update
      setProjects(prev => prev.filter(p => p.id !== optimisticProject.id));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-light text-white tracking-tight flex items-center gap-3">
            <Folder className="w-8 h-8 text-blue-400 opacity-80" />
            Projects
          </h2>
          <p className="text-white/50 mt-2 text-sm">Manage your workspace environments</p>
        </div>
      </div>

      <form onSubmit={handleCreateProject} className="flex gap-4 mb-8">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          placeholder="New Project Name..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-300"
        />
        <button
          type="submit"
          disabled={!newProjectName.trim() || isCreating}
          className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-xl px-6 py-3 flex items-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          Create
        </button>
      </form>

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 border border-white/5 rounded-xl bg-white/5 border-dashed">
            <p className="text-white/40">No projects found. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map(project => (
              <div 
                key={project.id} 
                className={`p-5 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent hover:border-white/20 transition-all duration-300 group ${project.id.startsWith('temp-') ? 'opacity-60 animate-pulse' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-white/90 group-hover:text-white transition-colors">{project.name}</h3>
                    <p className="text-white/40 text-xs mt-1">Created {new Date(project.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Folder className="w-4 h-4 text-white/50" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

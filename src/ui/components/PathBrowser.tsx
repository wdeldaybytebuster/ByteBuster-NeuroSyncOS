import React, { useState, useEffect } from 'react';
import { Folder, File, ChevronUp, X, FolderOpen } from 'lucide-react';

const API = 'http://localhost:3743';

interface PathBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  mode: 'directory' | 'file';
  fileFilter?: string; // e.g. '.gguf' to only show GGUF files
  title?: string;
}

interface DirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

export function PathBrowser({ isOpen, onClose, onSelect, mode, fileFilter, title }: PathBrowserProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState('');
  const [items, setItems] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const browse = async (dirPath?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/system/browse-directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath || undefined }),
      });
      const d = await res.json();
      if (d.success) {
        setCurrentPath(d.currentPath);
        setParentPath(d.parentPath);
        let filteredItems = d.items;
        // In file mode with filter, only show matching files + all directories
        if (mode === 'file' && fileFilter) {
          filteredItems = d.items.filter((item: DirEntry) => 
            item.isDirectory || item.name.endsWith(fileFilter)
          );
        }
        setItems(filteredItems);
      } else {
        setError(d.error || 'Failed to browse');
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) browse();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[70vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">{title || (mode === 'directory' ? 'Select Directory' : 'Select File')}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {/* Current path bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-black/30 border-b border-white/5">
          <button onClick={() => browse(parentPath)} disabled={currentPath === parentPath} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronUp size={14} /></button>
          <span className="text-[10px] font-mono text-gray-300 truncate flex-1">{currentPath}</span>
          {mode === 'directory' && (
            <button onClick={() => { onSelect(currentPath); onClose(); }} className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold hover:bg-amber-500/30 transition-all">
              Select This Folder
            </button>
          )}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="text-xs text-gray-500 text-center py-8 font-mono">Loading...</div>
          ) : error ? (
            <div className="text-xs text-red-400 text-center py-8">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-8">Empty directory</div>
          ) : (
            <div className="space-y-0.5">
              {items.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (item.isDirectory) {
                      browse(item.path);
                    } else if (mode === 'file') {
                      onSelect(item.path);
                      onClose();
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-white/5 transition-all group"
                >
                  {item.isDirectory ? (
                    <Folder size={14} className="text-amber-400 shrink-0" />
                  ) : (
                    <File size={14} className="text-gray-500 shrink-0" />
                  )}
                  <span className={`text-xs truncate ${item.isDirectory ? 'text-white font-semibold' : 'text-gray-400'}`}>{item.name}</span>
                  {item.isDirectory && <span className="ml-auto text-[9px] text-gray-600 opacity-0 group-hover:opacity-100">→</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

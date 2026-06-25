import React, { useState, useEffect } from 'react';
import { RouteSwitchConfig } from './RouteSwitchConfig';
import { RoutingDials } from './RoutingDials';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState('mock');
  const [statusMsg, setStatusMsg] = useState('');
  
  // States for OpenAI Compatible / FreeLLMAPI
  const [baseUrl, setBaseUrl] = useState('http://localhost:1234/v1');
  const [modelId, setModelId] = useState('Auto');
  const [apiKey, setApiKey] = useState('');

  // States for Llama.cpp local GGUF
  const [modelPath, setModelPath] = useState('~/.neurosync/models/llama-3.gguf');

  // Load from localStorage and backend on mount
  useEffect(() => {
    fetch('/api/system/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.settings && data.settings.llm_api_key) {
          setApiKey(data.settings.llm_api_key);
        }
      })
      .catch(console.error);

    const saved = localStorage.getItem('neurosync_provider_config');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        if (config.provider) setProvider(config.provider);
        if (config.baseUrl) setBaseUrl(config.baseUrl);
        if (config.modelId) setModelId(config.modelId);
        if (config.apiKey) setApiKey(config.apiKey);
        if (config.modelPath) setModelPath(config.modelPath);
      } catch (e) {
        console.error('Failed to parse saved config');
      }
    }
  }, []);

  const handleConnect = async () => {
    setStatusMsg('Connecting...');
    try {
      let payload = { type: provider, config: {} as any };
      
      if (provider === 'openai-compatible') {
        payload.config = { baseUrl, apiKey, modelId };
      } else if (provider === 'llama-cpp') {
        payload.config = { modelPath };
      }

      const res = await fetch('http://localhost:3743/api/routeswitch/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        if (provider === 'openai-compatible' && apiKey) {
          await fetch('/api/system/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ llm_api_key: apiKey })
          }).catch(console.error);
        }
        
        setStatusMsg(`✅ ${data.message}`);
        // Save to localStorage
        localStorage.setItem('neurosync_provider_config', JSON.stringify({
          provider, baseUrl, apiKey, modelId, modelPath
        }));
        setTimeout(() => {
          setStatusMsg('');
          onClose();
        }, 1500);
      } else {
        setStatusMsg(`❌ ${data.error}`);
      }
    } catch (err: any) {
      setStatusMsg(`❌ Connection failed: ${err.message}`);
    }
  };

  const [activeTab, setActiveTab] = useState<'llm' | 'portability'>('llm');

  // Portability States
  const [backupProgress, setBackupProgress] = useState<number | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreStatus, setRestoreStatus] = useState('');

  const handleBackup = () => {
    setBackupProgress(0);
    const eventSource = new EventSource('/api/system/backup');
    eventSource.addEventListener('backup-progress', (e) => {
      const data = JSON.parse(e.data);
      setBackupProgress(data.progress);
    });
    eventSource.addEventListener('backup-complete', (e) => {
      const data = JSON.parse(e.data);
      setBackupProgress(100);
      eventSource.close();
      setStatusMsg(`✅ Backup complete: ${data.file}`);
      setTimeout(() => setBackupProgress(null), 3000);
    });
    eventSource.addEventListener('error', (e) => {
      setStatusMsg(`❌ Backup failed`);
      setBackupProgress(null);
      eventSource.close();
    });
  };

  const handleRestore = async () => {
    if (!restoreFile) return;
    setRestoreStatus('Restoring...');
    const formData = new FormData();
    formData.append('backup_file', restoreFile);

    try {
      const res = await fetch('/api/system/restore', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setRestoreStatus('✅ Restore complete. OS is rebooting...');
      } else {
        setRestoreStatus(`❌ Restore failed: ${data.error}`);
      }
    } catch (err: any) {
      setRestoreStatus(`❌ Network error: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="glass-panel p-6 max-w-md w-full flex flex-col gap-4 animate-fade-in" style={{
        background: 'var(--bg-glass)',
        border: '1px solid var(--border-glass)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="text-xl font-bold text-accent m-0" style={{ color: 'var(--text-main)' }}>⚙️ Settings</h2>
          <button className="btn-icon" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div className="flex border-b border-gray-700 mb-2">
          <button 
            className={`flex-1 py-2 text-sm font-bold ${activeTab === 'llm' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-500'}`}
            onClick={() => setActiveTab('llm')}
          >
            LLM Router
          </button>
          <button 
            className={`flex-1 py-2 text-sm font-bold ${activeTab === 'portability' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-500'}`}
            onClick={() => setActiveTab('portability')}
          >
            Sovereign Portability
          </button>
        </div>
        
        {activeTab === 'llm' && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold opacity-80" style={{ color: 'var(--text-main)' }}>LLM Provider Type</label>
              <select 
                className="input-base" 
                value={provider} 
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="mock">Offline Mock Engine (Free)</option>
                <option value="openai-compatible">FreeLLMAPI / Custom OpenAI</option>
                <option value="llama-cpp">Local GGUF (node-llama-cpp)</option>
              </select>
            </div>

            {provider === 'openai-compatible' && (
              <div className="flex flex-col gap-3 animate-fade-in">
                <div>
                  <label className="text-sm font-semibold opacity-80" style={{ color: 'var(--text-main)' }}>Base URL</label>
                  <input 
                    type="text" 
                    className="input-base" 
                    value={baseUrl} 
                    onChange={e => setBaseUrl(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold opacity-80" style={{ color: 'var(--text-main)' }}>Model ID ('Auto' for FreeLLMAPI proxy)</label>
                  <input 
                    type="text" 
                    className="input-base" 
                    value={modelId} 
                    onChange={e => setModelId(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold opacity-80" style={{ color: 'var(--text-main)' }}>API Key (Optional for Local)</label>
                  <input 
                    type="password" 
                    className="input-base" 
                    value={apiKey} 
                    onChange={e => setApiKey(e.target.value)} 
                    placeholder="sk-..."
                  />
                </div>
              </div>
            )}

            {provider === 'llama-cpp' && (
              <div className="flex flex-col gap-3 animate-fade-in">
                <div>
                  <label className="text-sm font-semibold opacity-80" style={{ color: 'var(--text-main)' }}>Local .gguf Model Path</label>
                  <input 
                    type="text" 
                    className="input-base" 
                    value={modelPath} 
                    onChange={e => setModelPath(e.target.value)} 
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleConnect}>Save & Connect</button>
            </div>

            <div className="mt-6 border-t border-gray-700 pt-6 flex flex-col gap-6">
              <RoutingDials />
              <RouteSwitchConfig />
            </div>
          </>
        )}

        {activeTab === 'portability' && (
          <div className="flex flex-col gap-6 animate-fade-in text-gray-300 text-sm">
            
            {/* Backup Section */}
            <div className="bg-gray-800 p-4 rounded border border-gray-700">
              <h3 className="text-blue-400 font-bold mb-2">Live Vault Backup</h3>
              <p className="text-xs text-gray-400 mb-4">Streams a safe copy of the SQLite database while the OS is running, without freezing the Wayland compositor.</p>
              
              {backupProgress !== null ? (
                <div className="w-full bg-gray-700 rounded h-4 mb-2 overflow-hidden">
                  <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${backupProgress}%` }}></div>
                </div>
              ) : (
                <button className="btn-primary w-full py-2" onClick={handleBackup}>Stream Backup (.db)</button>
              )}
            </div>

            {/* Restore Section */}
            <div className="bg-gray-900 p-4 rounded border border-red-900/30">
              <h3 className="text-red-400 font-bold mb-2">Critical System Restore</h3>
              <p className="text-xs text-gray-400 mb-4">WARNING: Overwrites your entire Vault and restarts the Node process manager.</p>
              
              <input 
                type="file" 
                accept=".db"
                className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600 mb-3"
                onChange={e => setRestoreFile(e.target.files?.[0] || null)}
              />
              <button 
                className="w-full py-2 bg-red-900/50 hover:bg-red-800 text-red-100 font-bold rounded transition-colors disabled:opacity-50"
                onClick={handleRestore}
                disabled={!restoreFile}
              >
                Overwrite & Reboot
              </button>
              {restoreStatus && <div className="mt-3 text-center font-bold text-xs">{restoreStatus}</div>}
            </div>
          </div>
        )}

        {statusMsg && (
          <div style={{ marginTop: '8px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', textAlign: 'center', color: 'var(--text-main)', fontSize: '0.9rem' }}>
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  );
}

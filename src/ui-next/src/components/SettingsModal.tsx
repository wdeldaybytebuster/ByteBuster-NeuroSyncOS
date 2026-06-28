'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Settings, Key, Cpu, Save, Loader2 } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gpt-4');
  const [provider, setProvider] = useState('openai');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  
  const hasFetched = useRef(false);

  useEffect(() => {
    if (isOpen && !hasFetched.current) {
      setLoading(true);
      fetch('/api/system/settings')
        .then(res => res.json())
        .then(data => {
          if (data.model_name) setModelName(data.model_name);
          if (data.provider) setProvider(data.provider);
          if (data.llm_api_key_configured) setHasExistingKey(true);
          hasFetched.current = true;
        })
        .catch(err => console.error('Failed to load settings', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        model_name: modelName,
        provider: provider,
      };
      
      // Only send API key if user entered a new one
      if (apiKey) {
        payload.llm_api_key = apiKey;
      }

      const res = await fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) throw new Error('Failed to save settings');
      
      if (apiKey) {
        setHasExistingKey(true);
        setApiKey('');
      }
      onClose();
    } catch (err) {
      console.error('Failed to save settings', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md glass-enclave rounded-2xl shadow-2xl overflow-hidden flex flex-col transform transition-all">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-glass-border)] bg-[var(--bg-dots)]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--color-scout-daemon)]/20 rounded-lg border border-[var(--color-scout-daemon)]/30">
              <Settings className="w-5 h-5 text-[var(--color-scout-daemon)]" />
            </div>
            <h2 className="text-xl font-heading font-medium">System Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="opacity-50 hover:opacity-100 p-2 rounded-full transition-colors hover:bg-[var(--color-glass-border)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 opacity-30 animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium opacity-70">
                  <Cpu className="w-4 h-4" />
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full bg-[var(--color-void)]/50 border border-[var(--color-glass-border)] rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--color-scout-daemon)] transition-all text-[var(--color-foreground)]"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="local">Local Model</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium opacity-70">
                  <Cpu className="w-4 h-4" />
                  Model Name
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full bg-[var(--color-void)]/50 border border-[var(--color-glass-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--color-scout-daemon)] transition-all placeholder-[var(--color-foreground-muted)] text-[var(--color-foreground)]"
                  placeholder="e.g., gpt-4o"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium opacity-70">
                  <Key className="w-4 h-4" />
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasExistingKey ? "sk-••••••••••••••••••••••••" : "Enter API key"}
                  className="w-full bg-[var(--color-void)]/50 border border-[var(--color-glass-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--color-scout-daemon)] transition-all placeholder-[var(--color-foreground-muted)] font-mono text-sm text-[var(--color-foreground)]"
                />
                {hasExistingKey && !apiKey && (
                  <p className="text-xs text-[var(--color-report-green)]/80 mt-1 pl-1">Key is currently configured.</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[var(--color-glass-border)] bg-[var(--color-void)]/30 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium opacity-70 hover:opacity-100 hover:bg-[var(--color-glass-border)] rounded-xl transition-all duration-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="px-5 py-2.5 text-sm font-medium bg-[var(--color-scout-daemon)]/20 hover:bg-[var(--color-scout-daemon)]/30 text-[var(--color-scout-daemon)] border border-[var(--color-scout-daemon)]/30 rounded-xl transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed dynamic-interactive"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

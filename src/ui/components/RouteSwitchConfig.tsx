import React, { useState, useEffect } from 'react';

interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
}

export function RouteSwitchConfig() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [primary, setPrimary] = useState('');
  const [fallback1, setFallback1] = useState('');
  const [fallback2, setFallback2] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch available models from discovery module
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.models) {
          setModels(data.models);
        }
      })
      .catch(console.error);

    // Fetch existing settings
    fetch('/api/system/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.settings) {
          if (data.settings.rs_primary) setPrimary(data.settings.rs_primary);
          if (data.settings.rs_fallback1) setFallback1(data.settings.rs_fallback1);
          if (data.settings.rs_fallback2) setFallback2(data.settings.rs_fallback2);
        }
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rs_primary: primary,
          rs_fallback1: fallback1,
          rs_fallback2: fallback2
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg('✅ Fallback chain saved successfully');
      } else {
        setStatusMsg(`❌ Error: ${data.error}`);
      }
    } catch (err: any) {
      setStatusMsg(`❌ Failed to save: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in text-sm text-gray-200 p-4 bg-gray-800 rounded-lg border border-gray-700 shadow-inner">
      <div>
        <h3 className="text-blue-400 font-bold mb-1 text-base">RouteSwitch Inference Engine</h3>
        <p className="text-xs text-gray-400 mb-4">
          Define fallback chains for automatic traffic routing when token limits are exhausted.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-400">Primary Model</label>
          <select 
            className="input-base"
            value={primary}
            onChange={e => setPrimary(e.target.value)}
          >
            <option value="">-- Select Primary Model --</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.context_length} ctx)</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-400">Secondary Model (Fallback 1)</label>
          <select 
            className="input-base"
            value={fallback1}
            onChange={e => setFallback1(e.target.value)}
          >
            <option value="">-- Select Fallback 1 --</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.context_length} ctx)</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-400">Tertiary Model (Fallback 2)</label>
          <select 
            className="input-base"
            value={fallback2}
            onChange={e => setFallback2(e.target.value)}
          >
            <option value="">-- Select Fallback 2 --</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.context_length} ctx)</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-between items-center mt-2">
        <div className="text-xs font-bold h-4">
          {statusMsg && (
            <span className={statusMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>
              {statusMsg}
            </span>
          )}
        </div>
        <button 
          onClick={handleSave} 
          disabled={loading}
          className="btn-primary py-2 px-6 rounded font-bold bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50 text-white shadow-lg"
        >
          {loading ? 'Saving...' : 'Save Chain'}
        </button>
      </div>
    </div>
  );
}

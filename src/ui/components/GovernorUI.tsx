import React, { useEffect, useState } from 'react';

const API = 'http://localhost:3743';

interface Telemetry {
  temperature: number;
  utilization: number;
  cores: number;
  maxWorkersConfig: number;
}

export function GovernorUI() {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [targetWorkers, setTargetWorkers] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(`${API}/api/system/metrics`);
    
    eventSource.addEventListener('telemetry', (e) => {
      const data = JSON.parse(e.data) as Telemetry;
      setTelemetry(data);
      if (targetWorkers === null) {
        setTargetWorkers(data.maxWorkersConfig);
      }
    });

    return () => {
      eventSource.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setTargetWorkers(value);
    
    if (telemetry && value > telemetry.cores - 1) {
      setShowWarning(true);
    } else {
      setShowWarning(false);
    }
  };

  const applyConfig = async () => {
    if (!targetWorkers) return;
    try {
      await fetch(`${API}/api/system/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxWorkers: targetWorkers })
      });
      setShowWarning(false);
    } catch (err) {
      console.error('Failed to update governor limit', err);
    }
  };

  if (!telemetry) {
    return <div className="p-4 bg-gray-900 rounded border border-gray-800 text-gray-400">Loading hardware telemetry...</div>;
  }

  const safeLimit = Math.max(1, telemetry.cores - 1);
  const isRedZone = targetWorkers! > safeLimit;

  return (
    <div className="p-6 bg-gray-900 rounded-lg border border-gray-800 text-white font-mono flex flex-col gap-4 max-w-md">
      <h2 className="text-xl font-bold text-blue-400">OS Resource Governor</h2>
      
      <div className="flex justify-between items-center bg-gray-800 p-3 rounded">
        <div>
          <p className="text-sm text-gray-400">CPU Core Temp</p>
          <p className={`text-xl ${telemetry.temperature > 85 ? 'text-red-500' : 'text-green-400'}`}>
            {telemetry.temperature.toFixed(1)}°C
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-400">System Load</p>
          <p className={`text-xl ${telemetry.utilization > 80 ? 'text-red-500' : 'text-blue-400'}`}>
            {telemetry.utilization}%
          </p>
        </div>
      </div>

      <div>
        <label className="text-sm text-gray-300 block mb-2">
          Engine Output (Worker Threads): <span className={`font-bold ${isRedZone ? 'text-red-500' : 'text-blue-400'}`}>{targetWorkers}</span> / {telemetry.cores}
        </label>
        <input 
          type="range" 
          min="1" 
          max={telemetry.cores} 
          value={targetWorkers || 1} 
          onChange={handleSliderChange}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Safe (1)</span>
          <span>Max ({telemetry.cores})</span>
        </div>
      </div>

      {showWarning && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded text-sm">
          <strong>Intent Preview Warning:</strong> Allocating {targetWorkers} workers on a {telemetry.cores}-core system will induce severe context-switching overhead. This configuration will likely result in foreground UI freezing, rapid battery drain, and critical thermal throttling.
        </div>
      )}

      <button 
        onClick={applyConfig}
        disabled={targetWorkers === telemetry.maxWorkersConfig}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-2 px-4 rounded transition-colors"
      >
        {targetWorkers === telemetry.maxWorkersConfig ? 'Applied' : 'Commit Configuration'}
      </button>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export default function AutonomyDials() {
  const [budget, setBudget] = useState(50);
  const [autonomy, setAutonomy] = useState(50);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Track if it's the initial render/load to prevent immediate POST
  const isInitialMount = useRef(true);

  useEffect(() => {
    fetch('/api/system/settings')
      .then(res => res.json())
      .then(data => {
        if (data.budget !== undefined) setBudget(data.budget);
        if (data.autonomy !== undefined) setAutonomy(data.autonomy);
        setIsLoaded(true);
      })
      .catch(err => console.error('Failed to load autonomy settings', err));
  }, []);

  const saveSettings = useCallback((newBudget: number, newAutonomy: number) => {
    fetch('/api/system/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget: newBudget, autonomy: newAutonomy })
    }).catch(err => console.error('Failed to save settings', err));
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      saveSettings(budget, autonomy);
    }, 500);
    
    return () => clearTimeout(timeout);
  }, [budget, autonomy, isLoaded, saveSettings]);

  return (
    <div className={`glass-enclave dynamic-interactive rounded-2xl p-6 w-full transition-opacity duration-300 ${!isLoaded ? 'opacity-50' : 'opacity-100'}`}>
      <h3 className="text-lg font-heading font-semibold mb-6">Autonomy & Limits</h3>
      
      <div className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label id="budget-label" className="text-sm font-medium">Budget & Rigour</label>
            <span className="text-xs opacity-60 font-mono" aria-hidden="true">{budget}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={budget}
            onChange={(e) => setBudget(parseInt(e.target.value))}
            aria-labelledby="budget-label"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={budget}
            className="w-full h-1.5 bg-[var(--bg-dots)] rounded-lg appearance-none cursor-pointer accent-[var(--color-port-grid)]"
            disabled={!isLoaded}
          />
          <div className="flex justify-between mt-1 text-[10px] opacity-50 uppercase font-semibold" aria-hidden="true">
            <span>Fast / Cheap</span>
            <span>Deep / Exhaustive</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label id="autonomy-label" className="text-sm font-medium">Sandbox Strictness</label>
            <span className="text-xs opacity-60 font-mono" aria-hidden="true">{autonomy}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={autonomy}
            onChange={(e) => setAutonomy(parseInt(e.target.value))}
            aria-labelledby="autonomy-label"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={autonomy}
            className="w-full h-1.5 bg-[var(--bg-dots)] rounded-lg appearance-none cursor-pointer accent-[var(--color-scout-daemon)]"
            disabled={!isLoaded}
          />
          <div className="flex justify-between mt-1 text-[10px] opacity-50 uppercase font-semibold" aria-hidden="true">
            <span>Ask for everything</span>
            <span>Fully Autonomous</span>
          </div>
        </div>
      </div>
    </div>
  );
}

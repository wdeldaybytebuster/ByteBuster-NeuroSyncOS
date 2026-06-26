'use client';

import { useState } from 'react';

export default function AutonomyDials() {
  const [budget, setBudget] = useState(50);
  const [autonomy, setAutonomy] = useState(50);

  return (
    <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full">
      <h3 className="text-lg font-semibold text-white mb-6">Autonomy & Limits</h3>
      
      <div className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label id="budget-label" className="text-sm font-medium text-zinc-300">Budget & Rigour</label>
            <span className="text-xs text-zinc-500 font-mono" aria-hidden="true">{budget}%</span>
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
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex justify-between mt-1 text-[10px] text-zinc-500 uppercase font-semibold" aria-hidden="true">
            <span>Fast / Cheap</span>
            <span>Deep / Exhaustive</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label id="autonomy-label" className="text-sm font-medium text-zinc-300">Sandbox Strictness</label>
            <span className="text-xs text-zinc-500 font-mono" aria-hidden="true">{autonomy}%</span>
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
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
          />
          <div className="flex justify-between mt-1 text-[10px] text-zinc-500 uppercase font-semibold" aria-hidden="true">
            <span>Ask for everything</span>
            <span>Fully Autonomous</span>
          </div>
        </div>
      </div>
    </div>
  );
}

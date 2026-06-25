import React, { useState, useEffect, useRef } from 'react';
import { Sliders, Shield, Zap } from 'lucide-react';

export function AutonomyDials() {
  const [budget, setBudget] = useState(70);
  const [autonomy, setAutonomy] = useState(30);

  useEffect(() => {
    fetch('/api/system/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.settings) {
          if (data.settings.budget !== undefined) setBudget(Number(data.settings.budget));
          if (data.settings.autonomy !== undefined) setAutonomy(Number(data.settings.autonomy));
        }
      })
      .catch(console.error);
  }, []);

  const initialRender = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget, autonomy })
      }).catch(console.error);
    }, 500);
  }, [budget, autonomy]);

  return (
    <div className="flex flex-col gap-6 w-full">
       <div className="flex flex-col gap-3 group">
         <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-gray-200 flex items-center gap-2 tracking-wide">
              <Shield size={16} className="text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]"/> 
              Budget & Rigour
            </span>
            <div className="bg-amber-500/10 text-amber-400 text-xs font-mono font-bold px-2 py-0.5 rounded border border-amber-500/20">
              {budget}%
            </div>
         </div>
         <p className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
           Controls Iteration Ceilings, context compaction depth, and logprob confidence thresholds (AgentStop).
         </p>
         <div className="relative pt-1">
           <input 
             type="range" 
             min="0" max="100" 
             value={budget} 
             onChange={e => setBudget(Number(e.target.value))} 
             className="w-full h-2 bg-gunmetal border border-white/10 rounded-lg appearance-none cursor-pointer hover:border-amber-500/50 transition-colors"
             style={{
               background: `linear-gradient(to right, rgba(251,191,36,0.8) ${budget}%, rgba(255,255,255,0.05) ${budget}%)`
             }}
           />
           {/* Custom slider thumb styles are typically in CSS, but the gradient provides the track visual */}
         </div>
       </div>

       <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

       <div className="flex flex-col gap-3 group">
         <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-gray-200 flex items-center gap-2 tracking-wide">
              <Zap size={16} className="text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]"/> 
              Autonomy & Delegation
            </span>
            <div className="bg-blue-500/10 text-blue-400 text-xs font-mono font-bold px-2 py-0.5 rounded border border-blue-500/20">
              {autonomy}%
            </div>
         </div>
         <p className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
           Adjusts strict Intent Previews (Sandbox isolation) versus immediate read-only execution.
         </p>
         <div className="relative pt-1">
           <input 
             type="range" 
             min="0" max="100" 
             value={autonomy} 
             onChange={e => setAutonomy(Number(e.target.value))} 
             className="w-full h-2 bg-gunmetal border border-white/10 rounded-lg appearance-none cursor-pointer hover:border-blue-500/50 transition-colors"
             style={{
               background: `linear-gradient(to right, rgba(59,130,246,0.8) ${autonomy}%, rgba(255,255,255,0.05) ${autonomy}%)`
             }}
           />
         </div>
       </div>
    </div>
  );
}

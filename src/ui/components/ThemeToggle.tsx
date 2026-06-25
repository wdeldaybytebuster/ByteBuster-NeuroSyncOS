import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex bg-gunmetal/30 p-1 rounded-lg border border-white/5 w-full justify-between shadow-glass-inner">
      <button
        onClick={() => setTheme('light')}
        className={`flex-1 flex justify-center py-2 rounded-md transition-all ${
          theme === 'light' 
            ? 'bg-white/10 text-sovereign-gold shadow-glow-gold' 
            : 'text-gray-500 hover:text-gray-300'
        }`}
        title="Light Mode"
      >
        <Sun size={16} />
      </button>
      
      <button
        onClick={() => setTheme('system')}
        className={`flex-1 flex justify-center py-2 rounded-md transition-all ${
          theme === 'system' 
            ? 'bg-white/10 text-core-exec shadow-glow-blue' 
            : 'text-gray-500 hover:text-gray-300'
        }`}
        title="System Default"
      >
        <Monitor size={16} />
      </button>

      <button
        onClick={() => setTheme('dark')}
        className={`flex-1 flex justify-center py-2 rounded-md transition-all ${
          theme === 'dark' 
            ? 'bg-white/10 text-report-green shadow-glow-cyan' 
            : 'text-gray-500 hover:text-gray-300'
        }`}
        title="Dark Mode"
      >
        <Moon size={16} />
      </button>
    </div>
  );
}

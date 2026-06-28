'use client';

import { useState } from 'react';
import SettingsModal from './SettingsModal';

export default function HeaderActions() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsSettingsOpen(true)}
        className="px-4 py-2 glass-enclave dynamic-interactive rounded-full text-xs font-medium hover:bg-[var(--color-glass-border)] transition-colors"
      >
        Settings
      </button>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}

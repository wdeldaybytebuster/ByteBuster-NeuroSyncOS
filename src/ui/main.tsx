import React from 'react';
import ReactDOM from 'react-dom/client';
import { OSLayout } from './layouts/OSLayout';
import { ThemeProvider } from './components/ThemeContext';
import { DeveloperModeProvider } from './components/DeveloperModeContext';
import { PreferencesProvider } from './components/PreferencesContext';
import './index.css';
import '@xyflow/react/dist/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <DeveloperModeProvider>
        <PreferencesProvider>
          <OSLayout />
        </PreferencesProvider>
      </DeveloperModeProvider>
    </ThemeProvider>
  </React.StrictMode>
);

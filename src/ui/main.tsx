import React from 'react';
import ReactDOM from 'react-dom/client';
import { OSLayout } from './layouts/OSLayout';
import { ThemeProvider } from './components/ThemeContext';
import { DeveloperModeProvider } from './components/DeveloperModeContext';
import './index.css';
import '@xyflow/react/dist/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <DeveloperModeProvider>
        <OSLayout />
      </DeveloperModeProvider>
    </ThemeProvider>
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { OSLayout } from './layouts/OSLayout';
import { ThemeProvider } from './components/ThemeContext';
import './index.css';
import '@xyflow/react/dist/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <OSLayout />
    </ThemeProvider>
  </React.StrictMode>
);

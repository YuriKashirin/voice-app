import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

// Auto-resize window initial content
window.addEventListener('DOMContentLoaded', () => {
  if (window.electronAPI) {
    window.electronAPI.resizeToFitContent();
  }
});

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

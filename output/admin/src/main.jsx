import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: #08080c; color: #f4f4f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  input, textarea, button { font-family: inherit; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #2a2a3a; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);

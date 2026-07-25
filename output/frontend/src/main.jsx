import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Global CSS reset — dark, mobile-first
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { color-scheme: dark; }
  html, body { height: 100%; background: #08080c; color: #f4f4f8; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overscroll-behavior: none; }
  input, textarea, button, select { font-family: inherit; }
  ::-webkit-scrollbar { display: none; }
  * { -webkit-tap-highlight-color: transparent; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

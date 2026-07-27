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

  /* ── Leaflet, themed to the Q design system ─────────────────────────── */
  .leaflet-container { background: #08080c; font-family: 'Space Grotesk', system-ui, sans-serif; }
  .leaflet-popup-content-wrapper {
    background: linear-gradient(180deg, #13131b, #101016);
    border: 1px solid #2a2a3a; border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,.6);
  }
  .leaflet-popup-content { margin: 12px 14px; }
  .leaflet-popup-tip { background: #101016; border: 1px solid #2a2a3a; }
  .leaflet-control-attribution {
    background: rgba(8,8,12,.72) !important; color: #50505f !important;
    font-size: 10px; border-radius: 0 0 8px 0; backdrop-filter: blur(6px);
  }
  .leaflet-control-attribution a { color: #6b6b80 !important; }
  .leaflet-control-zoom a {
    background: rgba(16,16,22,.92) !important; color: #a78bfa !important;
    border: 1px solid #2a2a3a !important; backdrop-filter: blur(6px);
    font-weight: 600;
  }
  .leaflet-control-zoom a:hover { background: rgba(139,92,246,.22) !important; color: #f4f4f8 !important; }
  .leaflet-control-zoom { border: none !important; border-radius: 12px; overflow: hidden; }
  .q-pin { transition: transform .16s ease; }
  .q-pin:hover { transform: scale(1.12); z-index: 900 !important; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/**
 * Admin App — Venue staff panel
 *
 * Single-page app with bottom nav and shared socket connection.
 * All screens receive businessId and socket state as props.
 */

import React, { useState } from 'react';
import { useAdminAuth } from './hooks/useAdminAuth.js';
import { useVenueSocket } from './hooks/useVenueSocket.js';
import { setAdminToken, onTokenExpired } from './api/client.js';

// Screens
import Dashboard   from './screens/Dashboard.jsx';
import QueueManager from './screens/QueueManager.jsx';
import Bookings    from './screens/Bookings.jsx';
import UserLookup  from './screens/UserLookup.jsx';
import BanManager  from './screens/BanManager.jsx';
import Alerts      from './screens/Alerts.jsx';
import Settings    from './screens/Settings.jsx';
import Payouts     from './screens/Payouts.jsx';
import LoginScreen from './screens/Login.jsx';

const NAV = [
  { id: 'dashboard',  icon: '🏠', label: 'Home' },
  { id: 'queue',      icon: '🔢', label: 'Queue' },
  { id: 'bookings',   icon: '📅', label: 'Books' },
  { id: 'alerts',     icon: '⚠️',  label: 'Alerts' },
  { id: 'settings',   icon: '⚙️',  label: 'Settings' },
];

export default function App() {
  const { user, businessId, loading, login, logout, token } = useAdminAuth();
  const [screen, setScreen] = useState('dashboard');
  const { alerts, occupancy, queueUpdated, acknowledgeAlert } = useVenueSocket(
    businessId,
    token   // raw JWT string from tokenRef, not from user object
  );

  if (loading) return <Splash />;
  if (!user || !businessId) return <LoginScreen onLogin={login} />;

  const sharedProps = { businessId, queueUpdated };

  const screens = {
    dashboard: <Dashboard {...sharedProps} alerts={alerts} occupancy={occupancy} acknowledgeAlert={acknowledgeAlert} />,
    queue:     <QueueManager {...sharedProps} />,
    bookings:  <Bookings {...sharedProps} />,
    lookup:    <UserLookup {...sharedProps} />,
    bans:      <BanManager {...sharedProps} />,
    alerts:    <Alerts alerts={alerts} acknowledgeAlert={acknowledgeAlert} />,
    settings:  <Settings {...sharedProps} />,
    payouts:   <Payouts {...sharedProps} />,
  };

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#08080c' }}>
      {/* Alert banner — always on top */}
      {alerts.length > 0 && screen !== 'alerts' && (
        <div
          onClick={() => setScreen('alerts')}
          style={{
            background: 'rgba(255,77,109,0.12)', borderBottom: '2px solid #ff4d6d',
            padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 20 }}>🚨</span>
          <span style={{ flex: 1, color: '#ff4d6d', fontWeight: 700, fontSize: 14 }}>
            {alerts.length} banned user alert{alerts.length > 1 ? 's' : ''} — tap to view
          </span>
          <span style={{ color: '#ff4d6d' }}>›</span>
        </div>
      )}

      {/* Screen content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {screens[screen] || screens.dashboard}
      </div>

      {/* Bottom nav */}
      <nav style={{
        height: 64, background: 'rgba(8,8,12,0.98)', borderTop: '1px solid #16161f',
        display: 'flex', flexShrink: 0,
      }}>
        {NAV.map((tab) => {
          const active = screen === tab.id;
          const hasAlert = tab.id === 'alerts' && alerts.length > 0;
          return (
            <button
              key={tab.id}
              onClick={() => setScreen(tab.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: 'none',
                color: active ? '#8b5cf6' : hasAlert ? '#ff4d6d' : '#50505f',
                fontSize: 12, gap: 2, cursor: 'pointer', position: 'relative',
              }}
            >
              <span style={{ fontSize: 22 }}>{tab.icon}</span>
              <span style={{ fontWeight: active ? 700 : 400 }}>{tab.label}</span>
              {hasAlert && (
                <div style={{
                  position: 'absolute', top: 8, right: '50%', transform: 'translateX(8px)',
                  width: 8, height: 8, borderRadius: '50%', background: '#ff4d6d',
                }} />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Splash() {
  return (
    <div style={{ height: '100dvh', background: '#08080c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 48, fontWeight: 900, color: '#8b5cf6' }}>Q</div>
    </div>
  );
}

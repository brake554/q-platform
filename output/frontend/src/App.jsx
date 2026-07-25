/**
 * App — Root component
 *
 * Sets up: Router, Socket.io connection, auth initialization, route guards
 */

import React, { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { AnimatePresence } from 'framer-motion';
import { initApiAuth } from './api/client.js';
import { useStore } from './store/index.js';
import { api } from './api/client.js';

// Screens
import Home      from './screens/Home.jsx';
import Login     from './screens/Login.jsx';
import Register  from './screens/Register.jsx';
import Verify    from './screens/Verify.jsx';
import VenueDetail from './screens/VenueDetail.jsx';
import Queue     from './screens/Queue.jsx';
import Booking   from './screens/Booking.jsx';
import Profile   from './screens/Profile.jsx';

// Components
import Notifications from './components/Notifications.jsx';
import { MapIcon, UserIcon } from './components/Icons.jsx';

// Bottom nav tabs
const NAV_TABS = [
  { path: '/',        Icon: MapIcon,  label: 'Explore' },
  { path: '/profile', Icon: UserIcon, label: 'Profile' },
];

function BottomNav() {
  const location = useLocation();
  const hiddenOn = ['/login', '/register', '/verify'];
  if (hiddenOn.some((p) => location.pathname.startsWith(p))) return null;

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 64, background: 'rgba(8,8,12,0.96)', backdropFilter: 'blur(16px)',
      borderTop: '1px solid #16161f',
      display: 'flex', zIndex: 100,
    }}>
      {NAV_TABS.map((tab) => {
        const active = location.pathname === tab.path;
        return (
          <a key={tab.path} href={tab.path} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: active ? '#8b5cf6' : '#50505f',
            fontSize: 12, gap: 4,
          }}>
            <tab.Icon size={22} />
            <span style={{ fontWeight: active ? 700 : 400 }}>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function RequireAuth({ children }) {
  const { user, isLoading } = useStore((s) => ({ user: s.user, isLoading: s.isLoading }));
  if (isLoading) return <div style={{ minHeight: '100dvh', background: '#08080c' }} />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireVerified({ children }) {
  const { user, isLoading } = useStore((s) => ({ user: s.user, isLoading: s.isLoading }));
  if (isLoading) return <div style={{ minHeight: '100dvh', background: '#08080c' }} />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_verified) return <Navigate to="/verify" replace />;
  return children;
}

export default function App() {
  const { login, logout, setToken, setLoading } = useStore();
  const socketRef = useRef(null);

  // Initialize API auth injections
  useEffect(() => {
    initApiAuth(
      () => useStore.getState().accessToken,
      setToken,
      logout
    );

    // Try to restore session via refresh cookie
    setLoading(true);
    api.post('/auth/refresh')
      .then(({ accessToken }) => {
        setToken(accessToken);
        return api.get('/auth/me');
      })
      .then((user) => {
        useStore.getState().setUser(user);
        useStore.getState().setLoading(false);
      })
      .catch(() => {
        useStore.getState().setLoading(false);
      });
  }, []);

  // Set up Socket.io after token is available
  useEffect(() => {
    const token = useStore.getState().accessToken;
    const user  = useStore.getState().user;
    if (!user || socketRef.current) return;

    const socket = io({
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('join:user_room', { userId: user.id });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [useStore.getState().user?.id]);

  const socket = socketRef.current;

  return (
    <BrowserRouter>
      <Notifications socket={socket} />
      <AnimatePresence mode="wait">
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify"   element={<Verify />} />

          {/* Requires auth (any user) */}
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/business/:id" element={<RequireAuth><VenueDetail socket={socket} /></RequireAuth>} />
          <Route path="/queue/:id" element={<RequireAuth><Queue socket={socket} /></RequireAuth>} />

          {/* Requires verified account */}
          <Route path="/booking/:id" element={<RequireVerified><Booking /></RequireVerified>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
      <BottomNav />
    </BrowserRouter>
  );
}

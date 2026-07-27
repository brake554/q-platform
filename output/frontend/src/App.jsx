/**
 * App — Root component
 *
 * Sets up: Router, Socket.io connection, auth initialization, route guards
 */

import React, { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { AnimatePresence, motion } from 'framer-motion';
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
import PageTransition, { depthOf } from './components/PageTransition.jsx';

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
      display: 'flex', zIndex: 1000,
    }}>
      {NAV_TABS.map((tab) => {
        const active = location.pathname === tab.path;
        return (
          <Link key={tab.path} to={tab.path} style={{
            position: 'relative', flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: active ? '#a78bfa' : '#50505f',
            fontSize: 12, gap: 4, WebkitTapHighlightColor: 'transparent',
          }}>
            {active && (
              <motion.span
                layoutId="nav-glow"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                style={{
                  position: 'absolute', top: 6, width: 52, height: 52, borderRadius: 16,
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.20), rgba(217,70,239,0.12))',
                  border: '1px solid rgba(139,92,246,0.28)',
                }}
              />
            )}
            <motion.span
              whileTap={{ scale: 0.86 }}
              animate={{ scale: active ? 1.06 : 1, y: active ? -1 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              style={{ position: 'relative', display: 'flex' }}
            >
              <tab.Icon size={22} />
            </motion.span>
            <span style={{ position: 'relative', fontWeight: active ? 700 : 400 }}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AnimatedRoutes({ socket }) {
  const location = useLocation();
  const depth = depthOf(location.pathname);
  const prevDepth = useRef(depth);
  const dir = depth > prevDepth.current ? 1 : depth < prevDepth.current ? -1 : 0;
  useEffect(() => { prevDepth.current = depth; }, [depth]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition key={location.pathname} dir={dir}>
        <Routes location={location}>
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
      </PageTransition>
    </AnimatePresence>
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
      <AnimatedRoutes socket={socket} />
      <BottomNav />
    </BrowserRouter>
  );
}

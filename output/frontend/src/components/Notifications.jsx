/**
 * Notifications — Toast overlay + ban warning overlay
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/index.js';
import { CheckCircleIcon, AlertTriangleIcon, BanIcon, InfoIcon, ClockIcon } from './Icons.jsx';

const TYPE_STYLES = {
  success: { bg: 'rgba(45,212,143,0.12)', border: '#2dd48f', Icon: CheckCircleIcon },
  warning: { bg: '#1f1500', border: '#f5a524', Icon: AlertTriangleIcon },
  error:   { bg: '#1f0000', border: '#ff4d6d', Icon: BanIcon },
  info:    { bg: '#0f0f2a', border: '#8b5cf6', Icon: InfoIcon },
  timer:   { bg: '#1a0a2e', border: '#a78bfa', Icon: ClockIcon },
};

function Toast({ notif, onDismiss }) {
  const style = TYPE_STYLES[notif.type] || TYPE_STYLES.info;

  useEffect(() => {
    const timer = setTimeout(onDismiss, notif.type === 'warning' ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, [onDismiss, notif.type]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      onClick={onDismiss}
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        cursor: 'pointer',
        maxWidth: 340,
        boxShadow: `0 4px 20px rgba(0,0,0,0.5)`,
      }}
    >
      <style.Icon size={18} color={style.border} style={{ marginTop: 1 }} />
      <div style={{ fontSize: 14, color: '#f4f4f8', lineHeight: 1.4 }}>{notif.message}</div>
    </motion.div>
  );
}

export default function Notifications({ socket }) {
  const { notifications, addNotification, clearNotification } = useStore();

  // Listen for ban-related socket events and surface them as notifications
  useEffect(() => {
    if (!socket) return;

    const onBanWarning = ({ businessName, message }) => {
      addNotification({ type: 'error', message: message || `You have a ban at ${businessName}` });
    };

    const onBanIssued = ({ message }) => {
      addNotification({ type: 'error', message });
    };

    const onBanLifted = ({ businessName, message }) => {
      addNotification({ type: 'success', message: message || `Your ban at ${businessName} has been lifted` });
    };

    const onBookingNoShow = ({ message }) => {
      addNotification({ type: 'warning', message });
    };

    socket.on('ban:entry_warning', onBanWarning);
    socket.on('ban:issued', onBanIssued);
    socket.on('ban:lifted', onBanLifted);
    socket.on('booking:no_show', onBookingNoShow);

    return () => {
      socket.off('ban:entry_warning', onBanWarning);
      socket.off('ban:issued', onBanIssued);
      socket.off('ban:lifted', onBanLifted);
      socket.off('booking:no_show', onBookingNoShow);
    };
  }, [socket, addNotification]);

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0, zIndex: 900,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8, padding: '0 16px', pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {notifications.slice(0, 3).map((notif) => (
          <div key={notif.id} style={{ pointerEvents: 'auto' }}>
            <Toast
              notif={notif}
              onDismiss={() => clearNotification(notif.id)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

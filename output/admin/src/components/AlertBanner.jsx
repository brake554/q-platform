/**
 * AlertBanner — Full-width red flash for banned user geo-fence entry
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AlertBanner({ alerts, onAcknowledge }) {
  return (
    <AnimatePresence>
      {alerts.map((alert) => (
        <motion.div
          key={alert.id}
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -120, opacity: 0 }}
          style={{
            background: 'rgba(255,77,109,0.12)',
            border: '2px solid #ff4d6d',
            borderRadius: 0,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            zIndex: 1000,
          }}
        >
          {/* User photo */}
          {alert.photoUrl ? (
            <img src={alert.photoUrl} alt={alert.userName}
              style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '3px solid #ff4d6d', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#3a0000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
              🚫
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#ff4d6d', fontWeight: 800, letterSpacing: 2, marginBottom: 2 }}>
              ⚠️ BANNED USER DETECTED
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
              {alert.userName}
            </div>
            <div style={{ fontSize: 13, color: '#9a9aad' }}>Score: {alert.score} • {alert.banReason}</div>
          </div>

          <button
            onClick={() => onAcknowledge(alert.id)}
            style={{
              background: '#ff4d6d', border: 'none', borderRadius: 10,
              color: '#fff', padding: '10px 20px', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            Acknowledged
          </button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

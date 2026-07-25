import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ScoreChip from '../components/ScoreChip.jsx';

export default function Alerts({ alerts, acknowledgeAlert }) {
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f8' }}>Alerts</h2>
        <div style={{ fontSize: 13, color: '#50505f' }}>{alerts.length} active</div>
      </div>

      {alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#50505f' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div>No active alerts</div>
        </div>
      ) : (
        <AnimatePresence>
          {alerts.map((alert) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                background: '#1f0000', border: '2px solid #ff4d6d', borderRadius: 14,
                padding: '16px 20px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 16,
              }}
            >
              {alert.photoUrl ? (
                <img src={alert.photoUrl} alt={alert.userName}
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '3px solid #ff4d6d', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,77,109,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>🚫</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#ff4d6d', letterSpacing: 2, fontWeight: 800, marginBottom: 4 }}>
                  BANNED USER ENTERED GEOFENCE
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  {alert.userName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ScoreChip score={alert.score} small />
                  <span style={{ fontSize: 12, color: '#9a9aad' }}>{alert.banReason}</span>
                </div>
                <div style={{ fontSize: 11, color: '#50505f', marginTop: 4 }}>
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </div>
              </div>

              <button
                onClick={() => acknowledgeAlert(alert.id)}
                style={{
                  padding: '10px 16px', fontSize: 13, fontWeight: 700,
                  background: '#ff4d6d', border: 'none', borderRadius: 10,
                  color: '#fff', cursor: 'pointer', flexShrink: 0,
                }}
              >
                Dismiss
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

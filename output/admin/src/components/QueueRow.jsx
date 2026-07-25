/**
 * QueueRow — Single row in the queue manager table
 */

import React from 'react';
import { motion } from 'framer-motion';
import ScoreChip from './ScoreChip.jsx';

export default function QueueRow({ entry, onAdmit, onRemove, isAdmitting }) {
  const timeSince = (dt) => {
    const s = Math.floor((Date.now() - new Date(dt)) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
  };

  const isTimerActive = entry.status === 'timer_active';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px',
        background: isTimerActive ? '#0f1a0f' : '#101016',
        border: `1px solid ${isTimerActive ? '#2dd48f' : entry.is_red_flagged ? '#3a0000' : '#1a1a26'}`,
        borderRadius: 12, marginBottom: 8,
      }}
    >
      {/* Position */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: '#08080c', border: '2px solid #2a2a3a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 800, color: '#8b5cf6', flexShrink: 0,
      }}>
        {entry.position}
      </div>

      {/* User info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f8' }}>{entry.full_name}</span>
          {entry.is_red_flagged && <ScoreChip score={entry.score} isRedFlagged small />}
          {!entry.is_red_flagged && <ScoreChip score={entry.score} small />}
        </div>
        <div style={{ fontSize: 12, color: '#50505f' }}>
          Party of {entry.party_size} • Joined {timeSince(entry.joined_at)} ago
          {isTimerActive && <span style={{ color: '#2dd48f', marginLeft: 8, fontWeight: 700 }}>⏱ Timer active</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {entry.status === 'waiting' && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => onAdmit(entry.id)}
            disabled={isAdmitting}
            style={{
              padding: '12px 20px', fontSize: 15, fontWeight: 700,
              background: '#2dd48f', border: 'none', borderRadius: 10,
              color: '#fff', cursor: 'pointer',
              opacity: isAdmitting ? 0.6 : 1,
            }}
          >
            Admit
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => onRemove(entry.id)}
          style={{
            padding: '12px 16px', fontSize: 14, fontWeight: 600,
            background: '#16161f', border: '1px solid #2a2a3a', borderRadius: 10,
            color: '#9a9aad', cursor: 'pointer',
          }}
        >
          Remove
        </motion.button>
      </div>
    </motion.div>
  );
}

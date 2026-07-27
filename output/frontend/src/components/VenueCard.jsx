/**
 * VenueCard — Business listing card for the home screen / search results
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CategoryIcon } from './Icons.jsx';

function OccupancyBar({ pct }) {
  const color = pct >= 90 ? '#ff4d6d' : pct >= 70 ? '#f5a524' : '#2dd48f';
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9a9aad', marginBottom: 4 }}>
        <span>Occupancy</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: '#2a2a3a', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ height: '100%', background: color, borderRadius: 2 }}
        />
      </div>
    </div>
  );
}

export default function VenueCard({ business, index = 0 }) {
  const navigate = useNavigate();
  const {
    id, name, category, address, occupancy_pct = 0,
    queue_length = 0, entry_fee_cents = 0, current_occupancy, capacity,
  } = business;

  const isFull = occupancy_pct >= 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring', stiffness: 380, damping: 32,
        delay: Math.min(index, 8) * 0.045,
      }}
      whileHover={{ y: -2, borderColor: '#3a3a52' }}
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate(`/business/${id}`)}
      style={{
        background: 'linear-gradient(180deg, #13131b, #101016)',
        border: '1px solid #1e1e2a',
        borderRadius: 20,
        padding: '16px',
        cursor: 'pointer',
        marginBottom: 12,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 50, height: 50, borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(217,70,239,0.10))',
          border: '1px solid rgba(139,92,246,0.25)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>
          <CategoryIcon category={category} size={22} color="#a78bfa" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f4f4f8', marginBottom: 2 }}>
              {name}
            </div>
            {isFull ? (
              <span style={{ fontSize: 11, color: '#ff4d6d', background: 'rgba(255,77,109,0.12)', borderRadius: 999, padding: '4px 10px', fontWeight: 700 }}>
                FULL
              </span>
            ) : entry_fee_cents > 0 ? (
              <span style={{ fontSize: 13, color: '#8b5cf6', fontWeight: 700 }}>
                ${(entry_fee_cents / 100).toFixed(0)}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: '#2dd48f', background: 'rgba(45,212,143,0.12)', borderRadius: 999, padding: '4px 10px', fontWeight: 700 }}>
                FREE
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#6b6b80', marginBottom: 4 }}>{address}</div>
          {queue_length > 0 && (
            <div style={{ fontSize: 12, color: '#9a9aad' }}>
              <span style={{ color: '#a78bfa', fontWeight: 600 }}>{queue_length}</span> in Q
            </div>
          )}
        </div>
      </div>
      <OccupancyBar pct={occupancy_pct} />
    </motion.div>
  );
}

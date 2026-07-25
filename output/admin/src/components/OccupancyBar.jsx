import React from 'react';
import { motion } from 'framer-motion';

export default function OccupancyBar({ current, capacity }) {
  const pct = capacity > 0 ? Math.round((current / capacity) * 100) : 0;
  const color = pct >= 95 ? '#ff4d6d' : pct >= 80 ? '#f5a524' : '#2dd48f';

  return (
    <div style={{ padding: '20px 24px', background: '#101016', borderRadius: 16, border: '1px solid #1a1a26' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: '#9a9aad', letterSpacing: 1, textTransform: 'uppercase' }}>Occupancy</div>
        <div style={{ fontSize: 14, color, fontWeight: 700 }}>{current} / {capacity} ({pct}%)</div>
      </div>
      <div style={{ height: 12, borderRadius: 6, background: '#08080c', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
          style={{ height: '100%', background: color, borderRadius: 6 }}
        />
      </div>
      {pct >= 95 && (
        <div style={{ fontSize: 12, color: '#ff4d6d', marginTop: 8, fontWeight: 600 }}>
          ⚠️ Near capacity — consider pausing new admissions
        </div>
      )}
    </div>
  );
}

/**
 * ScoreBadge
 *
 * green (80-100) → yellow (50-79) → red (<50) → skull if red-flagged
 */

import React from 'react';
import { motion } from 'framer-motion';

const TIERS = [
  { min: 80,  color: '#2dd48f', label: 'Good Standing',   ring: '#2dd48f' },
  { min: 50,  color: '#f5a524', label: 'Watch List',       ring: '#f5a524' },
  { min: 0,   color: '#ff4d6d', label: 'Low Score',        ring: '#ff4d6d' },
];

function getTier(score) {
  return TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];
}

export default function ScoreBadge({ score = 100, isRedFlagged = false, size = 'md' }) {
  const tier = getTier(score);

  const sizes = {
    sm: { outer: 48, inner: 40, fontSize: 14, ringWidth: 4 },
    md: { outer: 80, inner: 68, fontSize: 22, ringWidth: 5 },
    lg: { outer: 140, inner: 120, fontSize: 38, ringWidth: 8 },
  };
  const s = sizes[size] || sizes.md;

  if (isRedFlagged) {
    return (
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{
          width: s.outer, height: s.outer, borderRadius: '50%',
          background: '#1a0000',
          border: `${s.ringWidth}px solid #ff4d6d`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px rgba(255,77,109,0.4)',
        }}
        title="Red Flag — Multiple Venue Bans"
      >
        <span style={{ fontSize: s.fontSize * 1.1 }}>💀</span>
        {size === 'lg' && (
          <div style={{ fontSize: 11, color: '#ff4d6d', fontWeight: 700, marginTop: 2 }}>RED FLAG</div>
        )}
      </motion.div>
    );
  }

  // Calculate ring circumference for progress arc
  const r = (s.outer / 2) - (s.ringWidth / 2);
  const circumference = 2 * Math.PI * r;
  const strokeDash = (score / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: s.outer, height: s.outer }}>
      {/* SVG ring */}
      <svg width={s.outer} height={s.outer} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
        {/* Background track */}
        <circle
          cx={s.outer / 2} cy={s.outer / 2} r={r}
          fill="none" stroke="#2a2a3a" strokeWidth={s.ringWidth}
        />
        {/* Score arc */}
        <motion.circle
          cx={s.outer / 2} cy={s.outer / 2} r={r}
          fill="none" stroke={tier.ring} strokeWidth={s.ringWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - strokeDash }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>

      {/* Inner circle with score */}
      <div style={{
        position: 'absolute',
        top: s.ringWidth + 4, left: s.ringWidth + 4,
        width: s.inner, height: s.inner,
        borderRadius: '50%', background: '#0d0d13',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: s.fontSize, fontWeight: 900, color: tier.color, lineHeight: 1 }}>
          {score}
        </div>
        {size === 'lg' && (
          <div style={{ fontSize: 11, color: '#6b6b80', marginTop: 2 }}>{tier.label}</div>
        )}
      </div>
    </div>
  );
}

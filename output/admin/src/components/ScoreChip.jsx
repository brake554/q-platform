import React from 'react';

export default function ScoreChip({ score = 100, isRedFlagged = false, small = false }) {
  if (isRedFlagged) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'rgba(255,77,109,0.12)', color: '#ff4d6d',
        borderRadius: 6, padding: small ? '2px 6px' : '4px 10px',
        fontSize: small ? 11 : 13, fontWeight: 700,
      }}>
        💀 RED FLAG
      </span>
    );
  }

  const color = score >= 80 ? '#2dd48f' : score >= 50 ? '#f5a524' : '#ff4d6d';
  const bg    = score >= 80 ? '#0a2018' : score >= 50 ? '#1f1500' : '#1f0000';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: bg, color, borderRadius: 6,
      padding: small ? '2px 8px' : '4px 12px',
      fontSize: small ? 12 : 14, fontWeight: 700,
    }}>
      {score}
    </span>
  );
}

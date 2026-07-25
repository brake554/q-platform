/**
 * QLogo — brand mark from the Q design system.
 * Space Grotesk "Q" with the top-right quarter dissolving into clock ticks.
 */

import React from 'react';

export default function QLogo({ size = 72, color }) {
  const grad = color
    ? { color }
    : {
        background: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      };
  const tick = color || '#a78bfa';

  return (
    <div style={{ position: 'relative', display: 'inline-block', lineHeight: 1 }}>
      <span style={{
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        fontSize: size, fontWeight: 400, letterSpacing: '-0.03em',
        display: 'inline-block',
        clipPath: 'polygon(0 0, 48.5% 0, 48.5% 52%, 100% 52%, 100% 100%, 0 100%)',
        ...grad,
      }}>Q</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
           style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <g stroke={tick} fill="none">
          <line x1="52.3" y1="21.5" x2="52.3" y2="14" strokeWidth="3.5" />
          <line x1="67.25" y1="25.1" x2="73.8" y2="18.6" strokeWidth="3.1" />
          <line x1="78.2" y1="35" x2="89.5" y2="31.25" strokeWidth="2.6" />
          <line x1="82.2" y1="48.5" x2="95.3" y2="48.5" strokeWidth="2.2" />
          <g strokeLinecap="round">
            <line x1="52.3" y1="48.5" x2="52.3" y2="27.8" strokeWidth="3.5" />
            <line x1="52.3" y1="48.5" x2="66.5" y2="41.1" strokeWidth="2.8" />
          </g>
        </g>
      </svg>
    </div>
  );
}

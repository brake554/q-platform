/**
 * Verify — Post-registration pending state screen
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/index.js';

export default function Verify() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  // If user gets verified (via WebSocket or polling), redirect to home
  useEffect(() => {
    if (user?.is_verified) navigate('/');
  }, [user?.is_verified, navigate]);

  return (
    <div style={{
      minHeight: '100dvh', background: '#08080c',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px', textAlign: 'center',
    }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
        style={{ fontSize: 64, marginBottom: 32 }}
      >
        ⏳
      </motion.div>

      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f4f4f8', marginBottom: 12 }}>
        Verification Pending
      </h1>
      <p style={{ fontSize: 15, color: '#6b6b80', lineHeight: 1.6, maxWidth: 300, marginBottom: 40 }}>
        Our team is reviewing your ID and selfie. This usually takes a few hours.
        You'll get a notification when you're approved and ready to Q.
      </p>

      <div style={{ background: '#101016', border: '1px solid #2a2a3a', borderRadius: 16, padding: 20, maxWidth: 300, width: '100%', marginBottom: 32 }}>
        <Step done label="Account created" />
        <Step done label="Phone verified" />
        <Step done label="ID submitted" />
        <Step label="Admin review" active />
        <Step label="Q-User activated" />
      </div>

      <button
        onClick={() => navigate('/login')}
        style={{ background: 'transparent', border: 'none', color: '#8b5cf6', fontSize: 15, cursor: 'pointer' }}
      >
        Back to Login
      </button>
    </div>
  );
}

function Step({ done, active, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? '#2dd48f' : active ? '#8b5cf6' : '#16161f',
        border: `2px solid ${done ? '#2dd48f' : active ? '#8b5cf6' : '#2a2a3a'}`,
        fontSize: 12,
      }}>
        {done ? '✓' : active ? '…' : ''}
      </div>
      <div style={{ fontSize: 14, color: done ? '#2dd48f' : active ? '#f4f4f8' : '#50505f' }}>
        {label}
      </div>
    </div>
  );
}

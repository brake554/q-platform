/**
 * QueueTimer — Full-screen 90-second countdown
 *
 * Displays when user is #1 in queue and must confirm entry.
 * Includes swipe-to-confirm interaction.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { useStore } from '../store/index.js';
import { useQueue } from '../hooks/useQueue.js';
import { CheckCircleIcon } from './Icons.jsx';

export default function QueueTimer({ businessId, socket }) {
  const { timerState } = useStore((s) => ({ timerState: s.timerState }));
  const { confirmEntry } = useQueue(businessId, socket);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);

  // Swipe gesture
  const x = useMotionValue(0);
  const progress = useTransform(x, [0, 260], [0, 1]);
  const bgColor = useTransform(progress, [0, 1], ['#8b5cf6', '#2dd48f']);

  // Countdown from timer state
  useEffect(() => {
    if (!timerState) return;
    const endTime = new Date(timerState.startedAt).getTime() + timerState.seconds * 1000;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    };

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [timerState]);

  const handleDragEnd = useCallback(async (_, info) => {
    if (info.offset.x > 240) {
      try {
        setConfirmed(true);
        await confirmEntry();
      } catch (err) {
        setConfirmed(false);
        setError(err.message);
      }
    } else {
      x.set(0);
    }
  }, [confirmEntry, x]);

  if (!timerState || secondsLeft === null) return null;

  const isUrgent = secondsLeft <= 30;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: '#08080c',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '32px',
        }}
      >
        {/* Pulsing ring */}
        <motion.div
          animate={{
            scale: isUrgent ? [1, 1.08, 1] : [1, 1.03, 1],
            borderColor: isUrgent ? ['#ff4d6d', '#f97316', '#ff4d6d'] : ['#8b5cf6', '#a78bfa', '#8b5cf6'],
          }}
          transition={{ repeat: Infinity, duration: isUrgent ? 0.7 : 1.5 }}
          style={{
            width: 220, height: 220, borderRadius: '50%',
            border: '6px solid #8b5cf6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 40,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <motion.div
              key={secondsLeft}
              initial={{ scale: 1.2, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                fontSize: 80, fontWeight: 900,
                color: isUrgent ? '#ff4d6d' : '#f4f4f8',
                lineHeight: 1,
              }}
            >
              {secondsLeft}
            </motion.div>
            <div style={{ fontSize: 14, color: '#9a9aad', letterSpacing: 2, textTransform: 'uppercase' }}>
              seconds
            </div>
          </div>
        </motion.div>

        <div style={{ fontSize: 28, fontWeight: 700, color: '#f4f4f8', marginBottom: 8, textAlign: 'center' }}>
          You&apos;re up!
        </div>
        <div style={{ fontSize: 16, color: '#9a9aad', marginBottom: 56, textAlign: 'center' }}>
          Head to the entrance now
        </div>

        {/* Swipe to confirm */}
        {!confirmed ? (
          <div style={{ width: '100%', maxWidth: 320, position: 'relative' }}>
            <motion.div
              style={{
                height: 68, borderRadius: 34, background: '#16161f',
                border: '2px solid #2a2a3a', position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'center',
              }}
            >
              {/* Fill track */}
              <motion.div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                background: bgColor, borderRadius: 34, width: x,
              }} />
              <div style={{
                position: 'absolute', width: '100%', textAlign: 'center',
                color: '#6b6b80', fontSize: 16, userSelect: 'none', zIndex: 0,
              }}>
                Swipe to confirm entry →
              </div>

              {/* Drag handle */}
              <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 260 }}
                dragElastic={0}
                style={{
                  x, width: 60, height: 60, borderRadius: '50%',
                  background: '#8b5cf6', marginLeft: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'grab', zIndex: 10, position: 'relative',
                  boxShadow: '0 4px 20px rgba(139,92,246,0.5)',
                }}
                onDragEnd={handleDragEnd}
                whileTap={{ scale: 0.95 }}
              >
                <span style={{ fontSize: 24 }}>→</span>
              </motion.div>
            </motion.div>
          </div>
        ) : (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ fontSize: 48, textAlign: 'center' }}
          >
            <CheckCircleIcon size={48} color="#2dd48f" /><br />
            <span style={{ fontSize: 20, color: '#2dd48f' }}>You&apos;re in!</span>
          </motion.div>
        )}

        {error && (
          <div style={{ color: '#ff4d6d', marginTop: 16, textAlign: 'center' }}>{error}</div>
        )}

        {secondsLeft === 0 && !confirmed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 24, color: '#ff4d6d', textAlign: 'center', fontSize: 16 }}
          >
            Time&apos;s up — you&apos;ve been moved to the back of the queue.
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Queue — Live queue position screen
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/client.js';
import { useStore } from '../store/index.js';
import { useQueue } from '../hooks/useQueue.js';
import QueueTimer from '../components/QueueTimer.jsx';
import { ClockIcon, BellIcon, CalendarIcon } from '../components/Icons.jsx';

export default function Queue({ socket }) {
  const { id: businessId } = useParams();
  const navigate = useNavigate();
  const currentQueue = useStore((s) => s.currentQueue);
  const timerState = useStore((s) => s.timerState);
  const [business, setBusiness] = useState(null);

  const { leaveQueue } = useQueue(businessId, socket);

  useEffect(() => {
    api.get(`/businesses/${businessId}`).then(setBusiness).catch(console.error);
  }, [businessId]);

  const position = currentQueue?.position;

  return (
    <div style={{
      minHeight: '100dvh', background: '#08080c',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '24px 20px',
    }}>
      {/* Header */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 }}>
        <button onClick={() => navigate(`/business/${businessId}`)} style={backBtn}>← Back</button>
        <div style={{ fontSize: 14, color: '#50505f' }}>Live Q</div>
        <div style={{ width: 40 }} />
      </div>

      {/* Business name */}
      {business && (
        <div style={{ fontSize: 16, color: '#6b6b80', marginBottom: 8 }}>{business.name}</div>
      )}

      {/* Position display */}
      {position !== undefined && (
        <motion.div
          key={position}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ textAlign: 'center', marginBottom: 48 }}
        >
          <div style={{ fontSize: 13, color: '#50505f', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            Your position
          </div>
          <div style={{
            fontSize: 96, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em',
            fontVariantNumeric: 'tabular-nums',
            background: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            filter: 'drop-shadow(0 8px 32px rgba(139,92,246,0.4))',
          }}>
            #{position}
          </div>
          <div style={{ fontSize: 14, color: '#50505f', marginTop: 8 }}>
            {position === 1 ? "You're next! Get ready." : `${position - 1} ahead of you`}
          </div>
        </motion.div>
      )}

      {/* Pulse indicator */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 48 }}>
        <motion.div
          animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          style={{ width: 8, height: 8, borderRadius: '50%', background: '#2dd48f' }}
        />
        <div style={{ fontSize: 13, color: '#50505f' }}>Queue updating in real time</div>
      </div>

      {/* Info cards */}
      <div style={{ width: '100%', maxWidth: 340 }}>
        <InfoCard icon={<ClockIcon size={20} color="#a78bfa" />} label="Admission timer" value={`${business?.admission_timer_seconds || 90}s`} />
        <InfoCard icon={<BellIcon size={20} color="#a78bfa" />} label="We'll notify you" value="Stay anywhere nearby" />
        <InfoCard icon={<CalendarIcon size={20} color="#a78bfa" />} label="Pre-book instead" value={
          <span onClick={() => navigate(`/booking/${businessId}`)} style={{ color: '#8b5cf6', cursor: 'pointer' }}>
            Reserve a time →
          </span>
        } />
      </div>

      {/* Leave button */}
      <div style={{ position: 'fixed', bottom: 64, left: 0, right: 0, zIndex: 110, padding: '16px 20px', background: 'rgba(8,8,12,0.95)', borderTop: '1px solid #16161f' }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={async () => { await leaveQueue(); navigate(`/business/${businessId}`); }}
          style={{ width: '100%', padding: '16px', fontSize: 16, fontWeight: 600, background: 'transparent', border: '1px solid rgba(255,77,109,0.35)', borderRadius: 999, color: '#ff4d6d', cursor: 'pointer' }}
        >
          Leave Queue
        </motion.button>
      </div>

      {/* Full-screen timer overlay */}
      {timerState?.businessId === businessId && (
        <QueueTimer businessId={businessId} socket={socket} />
      )}
    </div>
  );
}

function InfoCard({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', background: '#101016', border: '1px solid #1a1a26', borderRadius: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: '#50505f', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, color: '#ccc' }}>{value}</div>
      </div>
    </div>
  );
}

const backBtn = { background: 'transparent', border: 'none', color: '#8b5cf6', fontSize: 15, cursor: 'pointer' };

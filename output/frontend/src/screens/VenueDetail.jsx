/**
 * VenueDetail — Business page with queue join button
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api/client.js';
import { useStore } from '../store/index.js';
import { useQueue } from '../hooks/useQueue.js';
import ScoreBadge from '../components/ScoreBadge.jsx';
import { CategoryIcon, ClockIcon } from '../components/Icons.jsx';

export default function VenueDetail({ socket }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const currentQueue = useStore((s) => s.currentQueue);

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [partySize, setPartySize] = useState(1);
  const [error, setError] = useState(null);

  const { joinQueue, leaveQueue } = useQueue(id, socket);

  useEffect(() => {
    api.get(`/businesses/${id}`).then(setBusiness).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingScreen />;
  if (!business) return <NotFound navigate={navigate} />;

  const inQueue = currentQueue?.businessId === id;
  const occupancyPct = business.occupancy_pct || 0;

  async function handleJoin() {
    setError(null); setJoining(true);
    try {
      await joinQueue(partySize);
      navigate(`/queue/${id}`);
    } catch (err) { setError(err.message); }
    finally { setJoining(false); }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#08080c', paddingBottom: 120 }}>
      {/* Back */}
      <div style={{ padding: '16px 20px' }}>
        <button onClick={() => navigate(-1)} style={backBtn}>← Back</button>
      </div>

      {/* Hero */}
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20, marginBottom: 12,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(217,70,239,0.10))',
          border: '1px solid rgba(139,92,246,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CategoryIcon category={business.category} size={32} color="#a78bfa" />
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: '#f4f4f8', marginBottom: 4 }}>{business.name}</h1>
        <div style={{ fontSize: 14, color: '#6b6b80', marginBottom: 16 }}>{business.address}</div>

        {/* Occupancy bar */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9a9aad', marginBottom: 6 }}>
            <span>Current occupancy</span>
            <span style={{ color: occupancyPct >= 90 ? '#ff4d6d' : occupancyPct >= 70 ? '#f5a524' : '#2dd48f' }}>
              {business.current_occupancy} / {business.capacity} ({occupancyPct}%)
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: '#16161f', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${occupancyPct}%` }}
              transition={{ duration: 0.6 }}
              style={{
                height: '100%', borderRadius: 4,
                background: occupancyPct >= 90 ? '#ff4d6d' : occupancyPct >= 70 ? '#f5a524' : '#2dd48f',
              }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <StatBox label="In Queue" value={business.queue_length || 0} color="#a78bfa" />
          <StatBox label="Q Slots" value={business.q_slot_allocation} color="#3b82f6" />
          <StatBox
            label="Entry"
            value={business.entry_fee_cents ? `$${(business.entry_fee_cents / 100).toFixed(0)}` : 'Free'}
            color={business.entry_fee_cents ? '#f5a524' : '#2dd48f'}
          />
        </div>

        {business.description && (
          <p style={{ fontSize: 14, color: '#777', lineHeight: 1.6, marginBottom: 24 }}>
            {business.description}
          </p>
        )}

        {/* Grace period info */}
        <div style={{ background: '#101016', border: '1px solid #1e1e2a', borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#9a9aad', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClockIcon size={16} color="#a78bfa" />
            <span>Admission timer: <b style={{ color: '#f4f4f8' }}>{business.admission_timer_seconds}s</b>
            {'  '}|{'  '}
            Grace period: <b style={{ color: '#f4f4f8' }}>{business.grace_period_minutes} min</b></span>
          </div>
        </div>
      </div>

      {/* Party size selector */}
      {!inQueue && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ fontSize: 14, color: '#9a9aad', marginBottom: 8 }}>Party size</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <motion.button
                key={n}
                whileTap={{ scale: 0.9 }}
                onClick={() => setPartySize(n)}
                style={{
                  width: 48, height: 48, borderRadius: 16, fontSize: 16, fontWeight: 600,
                  background: partySize === n ? 'linear-gradient(135deg, #8b5cf6, #d946ef)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${partySize === n ? 'transparent' : '#2a2a3a'}`,
                  boxShadow: partySize === n ? '0 4px 16px rgba(139,92,246,0.4)' : 'none',
                  color: partySize === n ? '#fff' : '#9a9aad', cursor: 'pointer',
                }}
              >
                {n}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {error && <div style={{ padding: '0 20px 12px', color: '#ff4d6d', fontSize: 14 }}>{error}</div>}

      {/* CTA */}
      <div style={{ position: 'fixed', bottom: 64, left: 0, right: 0, zIndex: 110, padding: '16px 20px', background: 'rgba(8,8,12,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid #16161f' }}>
        {inQueue ? (
          <div style={{ display: 'flex', gap: 12 }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/queue/${id}`)}
              style={{ ...primaryBtn, flex: 1 }}
            >
              View My Queue
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { leaveQueue(); }}
              style={{ ...secondaryBtn, flex: 0.4 }}
            >
              Leave
            </motion.button>
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleJoin}
            disabled={joining || occupancyPct >= 100}
            style={{ ...primaryBtn, width: '100%', opacity: (joining || occupancyPct >= 100) ? 0.5 : 1 }}
          >
            {occupancyPct >= 100 ? 'At Capacity' : joining ? 'Joining…' : `Join Q${partySize > 1 ? ` (party of ${partySize})` : ''}`}
          </motion.button>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: '#101016', border: '1px solid #1e1e2a', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#50505f', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100dvh', background: '#08080c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#50505f', fontSize: 16 }}>Loading…</div>
    </div>
  );
}

function NotFound({ navigate }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#08080c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ color: '#50505f', fontSize: 40 }}>🔍</div>
      <div style={{ color: '#6b6b80' }}>Business not found</div>
      <button onClick={() => navigate('/')} style={backBtn}>Go Home</button>
    </div>
  );
}

const backBtn = { background: 'transparent', border: 'none', color: '#a78bfa', fontSize: 15, cursor: 'pointer', padding: '4px 0' };
const primaryBtn = { padding: '17px', fontSize: 17, fontWeight: 700, background: 'linear-gradient(135deg, #8b5cf6, #d946ef)', border: 'none', borderRadius: 999, color: '#fff', cursor: 'pointer', boxShadow: '0 8px 32px rgba(139,92,246,0.35)' };
const secondaryBtn = { padding: '16px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid #2a2a3a', borderRadius: 999, color: '#9a9aad', cursor: 'pointer' };

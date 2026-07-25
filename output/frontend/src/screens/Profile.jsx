/**
 * Profile — Score ring, reward balance, visit history, ban status
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api/client.js';
import { useStore } from '../store/index.js';
import { useAuth } from '../hooks/useAuth.js';
import ScoreBadge from '../components/ScoreBadge.jsx';

export default function Profile() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const { logout } = useAuth();

  const [scoreData, setScoreData] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [visits, setVisits] = useState([]);
  const [bans, setBans] = useState([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get(`/users/${user.id}/score`),
      api.get(`/users/${user.id}/rewards`),
      api.get(`/users/${user.id}/visits`),
      api.get(`/bans/user/${user.id}`),
    ]).then(([score, reward, visit, banData]) => {
      setScoreData(score);
      setRewards(reward);
      setVisits(visit.visits || []);
      setBans(banData.bans || []);
    }).catch(console.error);
  }, [user]);

  if (!user) return null;

  return (
    <div style={{ minHeight: '100dvh', background: '#08080c', padding: '24px 20px 100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f4f4f8' }}>Profile</h1>
        <button onClick={logout} style={{ background: 'transparent', border: '1px solid #2a2a3a', borderRadius: 8, color: '#6b6b80', fontSize: 13, padding: '6px 14px', cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>

      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 32 }}>
        <ScoreBadge
          score={scoreData?.score ?? user.score ?? 100}
          isRedFlagged={user.is_red_flagged}
          size="lg"
        />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f4f4f8', marginBottom: 4 }}>
            {user.full_name}
          </div>
          <div style={{ fontSize: 13, color: '#50505f' }}>{user.email}</div>
          {user.is_verified ? (
            <div style={{ fontSize: 12, color: '#2dd48f', marginTop: 6 }}>✓ Verified Q-User</div>
          ) : (
            <div style={{ fontSize: 12, color: '#f5a524', marginTop: 6 }}>⏳ Pending Verification</div>
          )}
        </div>
      </div>

      {/* Reward balance */}
      {rewards && (
        <div style={{ background: 'linear-gradient(135deg, #1a0a2e, rgba(45,212,143,0.12))', border: '1px solid #2a1a4a', borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#8b5cf6', letterSpacing: 1, marginBottom: 4 }}>Q REWARDS BALANCE</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#f4f4f8' }}>
            ${(rewards.balance_cents / 100).toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: '#50505f', marginTop: 4 }}>Earned from ads • Redeemable on entry fees</div>
        </div>
      )}

      {/* Score history */}
      {scoreData?.history?.length > 0 && (
        <Section title="Score History">
          {scoreData.history.slice(0, 5).map((event, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #101016' }}>
              <div>
                <div style={{ fontSize: 13, color: '#ccc' }}>{event.reason.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 11, color: '#50505f' }}>{event.business_name || 'Q Platform'}</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: event.delta > 0 ? '#2dd48f' : '#ff4d6d' }}>
                {event.delta > 0 ? '+' : ''}{event.delta}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Active bans */}
      {bans.filter((b) => b.is_active).length > 0 && (
        <Section title="Active Restrictions">
          {bans.filter((b) => b.is_active).map((ban) => (
            <div key={ban.id} style={{ background: '#1f0000', border: '1px solid #3a0000', borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ fontSize: 14, color: '#ff4d6d', fontWeight: 600 }}>{ban.business_name}</div>
              <div style={{ fontSize: 12, color: '#9a9aad', marginTop: 4 }}>Reason: {ban.reason}</div>
              <div style={{ fontSize: 11, color: '#50505f', marginTop: 4 }}>Contact the business to appeal this ban.</div>
            </div>
          ))}
        </Section>
      )}

      {/* Visit history */}
      {visits.length > 0 && (
        <Section title="Recent Visits">
          {visits.slice(0, 10).map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #101016' }}>
              <div style={{ fontSize: 13, color: '#ccc' }}>{v.business_name}</div>
              <div style={{ fontSize: 11, color: '#50505f' }}>
                {new Date(v.admitted_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 12, color: '#50505f', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

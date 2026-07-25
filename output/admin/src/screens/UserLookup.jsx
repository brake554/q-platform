import React, { useState } from 'react';
import { api } from '../api/client.js';
import ScoreChip from '../components/ScoreChip.jsx';

export default function UserLookup({ businessId }) {
  const [query, setQuery] = useState('');
  const [user, setUser] = useState(null);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [bans, setBans] = useState([]);
  const [error, setError] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    setError(null); setUser(null);
    try {
      // Search by user ID or name
      const data = await api.get(`/users/${encodeURIComponent(query)}`);
      setUser(data);
      const [scoreData, banData] = await Promise.all([
        api.get(`/users/${data.id}/score`),
        api.get(`/bans/user/${data.id}`),
      ]);
      setScoreHistory(scoreData.history || []);
      setBans(banData.bans || []);
    } catch (err) {
      setError('User not found');
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f8', marginBottom: 20 }}>User Lookup</h2>

      <form onSubmit={handleSearch} style={{ marginBottom: 24 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="User ID or name"
          style={{ display: 'block', width: '100%', padding: '14px', fontSize: 16, background: '#101016', border: '1px solid #2a2a3a', borderRadius: 12, color: '#f4f4f8', marginBottom: 10, boxSizing: 'border-box' }}
        />
        <button type="submit" style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 700, background: '#8b5cf6', border: 'none', borderRadius: 12, color: '#fff', cursor: 'pointer' }}>
          Search
        </button>
      </form>

      {error && <div style={{ color: '#ff4d6d', marginBottom: 16 }}>{error}</div>}

      {user && (
        <div>
          {/* User card */}
          <div style={{ background: '#101016', border: '1px solid #1a1a26', borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              {user.profile_photo_url ? (
                <img src={user.profile_photo_url} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover' }} alt={user.full_name} />
              ) : (
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#16161f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>👤</div>
              )}
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f4f4f8' }}>{user.full_name}</div>
                <ScoreChip score={user.score} isRedFlagged={user.is_red_flagged} />
              </div>
            </div>

            {/* Score history */}
            {scoreHistory.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#50505f', letterSpacing: 1, marginBottom: 8 }}>SCORE HISTORY</div>
                {scoreHistory.slice(0, 5).map((e, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #16161f', fontSize: 13 }}>
                    <span style={{ color: '#9a9aad' }}>{e.reason.replace(/_/g, ' ')}</span>
                    <span style={{ color: e.delta > 0 ? '#2dd48f' : '#ff4d6d', fontWeight: 700 }}>
                      {e.delta > 0 ? '+' : ''}{e.delta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active bans */}
          {bans.filter((b) => b.is_active).length > 0 && (
            <div style={{ background: '#1a0000', border: '1px solid rgba(255,77,109,0.12)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#ff4d6d', letterSpacing: 1, marginBottom: 8 }}>ACTIVE BANS</div>
              {bans.filter((b) => b.is_active).map((ban) => (
                <div key={ban.id} style={{ fontSize: 13, color: '#9a9aad', marginBottom: 4 }}>
                  🚫 {ban.business_name}: {ban.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

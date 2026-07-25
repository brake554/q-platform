import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import ScoreChip from '../components/ScoreChip.jsx';

export default function BanManager({ businessId }) {
  const [bans, setBans] = useState([]);
  const [issuingFor, setIssuingFor] = useState(null); // userId
  const [reason, setReason] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [foundUser, setFoundUser] = useState(null);

  useEffect(() => {
    api.get(`/bans/business/${businessId}`)
      .then(({ bans: b }) => setBans(b || []))
      .catch(console.error);
  }, [businessId]);

  async function handleLift(banId) {
    if (!confirm('Lift this ban?')) return;
    try {
      await api.delete(`/bans/${banId}`);
      setBans((prev) => prev.filter((b) => b.id !== banId));
    } catch (err) { alert(err.message); }
  }

  async function handleIssueBan() {
    if (!foundUser || !reason.trim()) return;
    try {
      await api.post('/bans', { userId: foundUser.id, businessId, reason });
      alert(`Ban issued for ${foundUser.full_name}`);
      setFoundUser(null); setReason('');
      // Refresh list
      const { bans: b } = await api.get(`/bans/business/${businessId}`);
      setBans(b || []);
    } catch (err) { alert(err.message); }
  }

  async function searchUser() {
    try {
      const data = await api.get(`/users/search?phone=${encodeURIComponent(searchPhone)}`);
      setFoundUser(data.users?.[0] || null);
      if (!data.users?.length) alert('User not found');
    } catch (err) { alert(err.message); }
  }

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f8', marginBottom: 20 }}>Ban Manager</h2>

      {/* Issue new ban */}
      <div style={{ background: '#101016', border: '1px solid #1a1a26', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: '#9a9aad', marginBottom: 12 }}>Issue a Ban</div>
        <input placeholder="Search by phone number" value={searchPhone}
          onChange={(e) => setSearchPhone(e.target.value)}
          style={inputStyle} />
        <button onClick={searchUser} style={{ ...btn, background: '#16161f', border: '1px solid #2a2a3a', color: '#ccc', marginBottom: 12, width: '100%' }}>
          Find User
        </button>
        {foundUser && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: '#f4f4f8', marginBottom: 8 }}>
              Found: <b>{foundUser.full_name}</b>
              <ScoreChip score={foundUser.score} small />
            </div>
            <input placeholder="Reason for ban" value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={inputStyle} />
            <button onClick={handleIssueBan} style={{ ...btn, background: '#ff4d6d', width: '100%' }}>
              Issue Ban
            </button>
          </div>
        )}
      </div>

      {/* Active bans list */}
      <div style={{ fontSize: 12, color: '#50505f', letterSpacing: 1, marginBottom: 12 }}>ACTIVE BANS ({bans.length})</div>
      {bans.map((ban) => (
        <div key={ban.id} style={{ background: '#1a0000', border: '1px solid rgba(255,77,109,0.12)', borderRadius: 12, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          {ban.profile_photo_url ? (
            <img src={ban.profile_photo_url} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} alt={ban.full_name} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,77,109,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🚫</div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f4f4f8', marginBottom: 2 }}>{ban.full_name}</div>
            <div style={{ fontSize: 12, color: '#6b6b80' }}>{ban.reason}</div>
          </div>
          <button onClick={() => handleLift(ban.id)} style={{ ...btn, background: '#16161f', border: '1px solid #2a2a3a', color: '#9a9aad', padding: '8px 14px' }}>
            Lift
          </button>
        </div>
      ))}
    </div>
  );
}

const inputStyle = { display: 'block', width: '100%', padding: '12px', fontSize: 15, background: '#08080c', border: '1px solid #2a2a3a', borderRadius: 10, color: '#f4f4f8', marginBottom: 10, boxSizing: 'border-box' };
const btn = { padding: '10px 16px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 10, cursor: 'pointer' };

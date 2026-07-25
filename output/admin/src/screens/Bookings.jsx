import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import ScoreChip from '../components/ScoreChip.jsx';

export default function Bookings({ businessId }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/bookings/business/${businessId}?date=${date}`)
      .then(({ bookings: b }) => setBookings(b || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId, date]);

  async function handleCheckIn(bookingId) {
    try {
      await api.post(`/bookings/${bookingId}/check-in`);
      setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status: 'checked_in' } : b));
    } catch (err) { alert(err.message); }
  }

  async function handleNoShow(bookingId) {
    if (!confirm('Mark this booking as a no-show?')) return;
    try {
      await api.post(`/bookings/${bookingId}/no-show`);
      setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status: 'no_show' } : b));
    } catch (err) { alert(err.message); }
  }

  const statusColors = { confirmed: '#f5a524', checked_in: '#2dd48f', no_show: '#ff4d6d', cancelled: '#50505f' };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f8' }}>Bookings</h2>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ background: '#101016', border: '1px solid #2a2a3a', borderRadius: 8, color: '#f4f4f8', padding: '8px 12px', fontSize: 14 }} />
      </div>

      {loading ? <div style={{ color: '#50505f', textAlign: 'center', padding: 40 }}>Loading…</div> : (
        bookings.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#50505f', padding: 60 }}>No bookings for this date.</div>
        ) : bookings.map((booking) => (
          <div key={booking.id} style={{ background: '#101016', border: `1px solid ${statusColors[booking.status] || '#1a1a26'}33`, borderRadius: 14, padding: '16px 20px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f4f4f8', marginBottom: 4 }}>
                  {booking.full_name}
                </div>
                <div style={{ fontSize: 13, color: '#6b6b80' }}>
                  {booking.booking_time} · Party of {booking.party_size}
                  {booking.notes && <span style={{ marginLeft: 8, color: '#50505f' }}>"{booking.notes}"</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScoreChip score={booking.score} isRedFlagged={booking.is_red_flagged} small />
                <span style={{ fontSize: 12, color: statusColors[booking.status], fontWeight: 700, textTransform: 'uppercase' }}>
                  {booking.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            {booking.grace_deadline_at && booking.status === 'confirmed' && (
              <div style={{ fontSize: 12, color: '#f5a524', marginBottom: 8 }}>
                Grace deadline: {new Date(booking.grace_deadline_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}

            {booking.status === 'confirmed' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleCheckIn(booking.id)}
                  style={admitBtn}>Check In</button>
                <button onClick={() => handleNoShow(booking.id)}
                  style={noShowBtn}>No Show</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

const admitBtn = { flex: 1, padding: '10px', fontSize: 14, fontWeight: 700, background: '#2dd48f', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' };
const noShowBtn = { padding: '10px 16px', fontSize: 14, background: '#16161f', border: '1px solid #2a2a3a', borderRadius: 8, color: '#9a9aad', cursor: 'pointer' };

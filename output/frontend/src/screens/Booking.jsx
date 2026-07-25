/**
 * Booking — Pre-book an arrival time at a business
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api/client.js';
import { useStore } from '../store/index.js';
import { CheckCircleIcon, ClockIcon } from '../components/Icons.jsx';

export default function Booking() {
  const { id: businessId } = useParams();
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  const [business, setBusiness] = useState(null);
  const [form, setForm] = useState({ date: '', time: '', partySize: 1, notes: '' });
  const [step, setStep] = useState('form');  // 'form' | 'payment' | 'confirmed'
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get(`/businesses/${businessId}`).then(setBusiness).catch(console.error);
  }, [businessId]);

  const totalCents = (business?.entry_fee_cents || 0) * form.partySize;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post('/bookings', {
        businessId,
        booking_date: form.date,
        booking_time: form.time,
        party_size: form.partySize,
        notes: form.notes,
        // payment_intent_id would be set after Stripe confirms payment
      });
      setBooking(result);
      setStep('confirmed');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!business) return <div style={loadStyle}>Loading…</div>;

  return (
    <div style={{ minHeight: '100dvh', background: '#08080c', padding: '24px 20px 120px' }}>
      <button onClick={() => navigate(-1)} style={backBtn}>← Back</button>

      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f4f4f8', margin: '20px 0 4px' }}>
        Pre-book at {business.name}
      </h1>
      <p style={{ color: '#6b6b80', fontSize: 14, marginBottom: 28 }}>
        Skip the line — arrive within your grace period and walk straight in.
      </p>

      {step === 'form' && (
        <form onSubmit={handleSubmit}>
          <Label>Date</Label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            required min={new Date().toISOString().slice(0, 10)} style={inputStyle} />

          <Label>Arrival Time</Label>
          <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}
            required style={inputStyle} />

          <Label>Party Size</Label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <motion.button key={n} type="button" whileTap={{ scale: 0.9 }}
                onClick={() => setForm({ ...form, partySize: n })}
                style={{
                  width: 44, height: 44, borderRadius: 10, fontSize: 16, fontWeight: 700,
                  background: form.partySize === n ? '#8b5cf6' : '#16161f',
                  border: `1px solid ${form.partySize === n ? '#8b5cf6' : '#2a2a3a'}`,
                  color: form.partySize === n ? '#fff' : '#9a9aad', cursor: 'pointer',
                }}
              >{n}</motion.button>
            ))}
          </div>

          <Label>Notes (optional)</Label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Birthday party, accessibility needs, etc."
            style={{ ...inputStyle, height: 80, resize: 'none' }} />

          {/* Grace period info */}
          <div style={{ background: '#101016', border: '1px solid #1e1e2a', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#9a9aad', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockIcon size={16} color="#a78bfa" />
              <span>Grace period: <b style={{ color: '#f4f4f8' }}>{business.grace_period_minutes} minutes</b></span>
            </div>
            <div style={{ fontSize: 12, color: '#50505f', marginTop: 4 }}>
              Arrive within {business.grace_period_minutes} min of your booked time. Miss it = back of queue.
            </div>
            {business.price_per_grace_minute_cents > 0 && (
              <div style={{ fontSize: 12, color: '#8b5cf6', marginTop: 6 }}>
                Need more time? Buy premium grace at ${(business.price_per_grace_minute_cents / 100).toFixed(2)}/min
              </div>
            )}
          </div>

          {/* Total */}
          {totalCents > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: '#f4f4f8', marginBottom: 20 }}>
              <span>Total</span>
              <span>${(totalCents / 100).toFixed(2)}</span>
            </div>
          )}

          {error && <div style={{ color: '#ff4d6d', fontSize: 14, marginBottom: 12 }}>{error}</div>}

          <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }} style={primaryBtn}>
            {loading ? 'Booking…' : totalCents > 0 ? `Pay $${(totalCents / 100).toFixed(2)} & Book` : 'Confirm Booking'}
          </motion.button>
        </form>
      )}

      {step === 'confirmed' && booking && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
              <CheckCircleIcon size={64} color="#2dd48f" />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f4f4f8', marginBottom: 8 }}>You're booked!</h2>
            <p style={{ color: '#6b6b80', marginBottom: 24, fontSize: 15 }}>
              Arrive by your grace deadline and walk straight in.
            </p>
            {booking.grace_deadline_at && (
              <div style={{ background: '#101016', border: '1px solid #8b5cf6', borderRadius: 14, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: '#8b5cf6', marginBottom: 4, letterSpacing: 1 }}>ARRIVE BY</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f8' }}>
                  {new Date(booking.grace_deadline_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )}
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => navigate('/')} style={primaryBtn}>
              Back to Map
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 13, color: '#9a9aad', marginBottom: 6, marginTop: 16 }}>{children}</div>;
}

const loadStyle = { minHeight: '100dvh', background: '#08080c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#50505f' };
const backBtn = { background: 'transparent', border: 'none', color: '#8b5cf6', fontSize: 15, cursor: 'pointer', padding: '4px 0' };
const inputStyle = { display: 'block', width: '100%', padding: '15px', fontSize: 16, background: '#101016', border: '1px solid #2a2a3a', borderRadius: 12, color: '#f4f4f8', outline: 'none', marginBottom: 0, boxSizing: 'border-box' };
const primaryBtn = { display: 'block', width: '100%', padding: '18px', fontSize: 17, fontWeight: 700, background: '#8b5cf6', border: 'none', borderRadius: 14, color: '#fff', cursor: 'pointer' };

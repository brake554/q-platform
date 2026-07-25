import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Settings({ businessId }) {
  const [form, setForm] = useState({
    q_slot_allocation: '',
    grace_period_minutes: '',
    admission_timer_seconds: '',
    premium_revenue_split: '',
    price_per_grace_minute_cents: '',
    entry_fee_cents: '',
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get(`/businesses/${businessId}`).then((b) => {
      setForm({
        q_slot_allocation: b.q_slot_allocation,
        grace_period_minutes: b.grace_period_minutes,
        admission_timer_seconds: b.admission_timer_seconds,
        premium_revenue_split: b.premium_revenue_split,
        price_per_grace_minute_cents: b.price_per_grace_minute_cents,
        entry_fee_cents: b.entry_fee_cents,
      });
    }).catch(console.error);
  }, [businessId]);

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true); setSaved(false);
    try {
      await api.patch(`/businesses/${businessId}`, {
        q_slot_allocation: parseInt(form.q_slot_allocation),
        grace_period_minutes: parseInt(form.grace_period_minutes),
        admission_timer_seconds: parseInt(form.admission_timer_seconds),
        premium_revenue_split: parseInt(form.premium_revenue_split),
        price_per_grace_minute_cents: parseInt(form.price_per_grace_minute_cents),
        entry_fee_cents: parseInt(form.entry_fee_cents),
      });
      setSaved(true);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  }

  const upd = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f8', marginBottom: 24 }}>Settings</h2>

      <form onSubmit={handleSave}>
        <FieldGroup
          label="Q Slot Allocation"
          hint="How many spots in your capacity to reserve for Q-users (10–50)"
          value={form.q_slot_allocation}
          onChange={upd('q_slot_allocation')}
          type="number" min={10} max={50}
        />
        <FieldGroup
          label="Grace Period (minutes)"
          hint="How long pre-booked users have to arrive (15–30)"
          value={form.grace_period_minutes}
          onChange={upd('grace_period_minutes')}
          type="number" min={15} max={30}
        />
        <FieldGroup
          label="Admission Timer (seconds)"
          hint="How long users have to confirm entry when admitted (default 90)"
          value={form.admission_timer_seconds}
          onChange={upd('admission_timer_seconds')}
          type="number" min={30} max={300}
        />
        <FieldGroup
          label="Entry Fee (cents)"
          hint="Cover charge or entry fee. 0 = free. e.g. 1000 = $10.00"
          value={form.entry_fee_cents}
          onChange={upd('entry_fee_cents')}
          type="number" min={0}
        />
        <FieldGroup
          label="Premium Grace Price (cents/min)"
          hint="Price per extra minute of grace time users can purchase"
          value={form.price_per_grace_minute_cents}
          onChange={upd('price_per_grace_minute_cents')}
          type="number" min={0}
        />
        <FieldGroup
          label="Premium Revenue Split (%)"
          hint="Your share of premium grace time purchases (10–50%)"
          value={form.premium_revenue_split}
          onChange={upd('premium_revenue_split')}
          type="number" min={10} max={50}
        />

        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '16px', fontSize: 16, fontWeight: 700, background: '#8b5cf6', border: 'none', borderRadius: 12, color: '#fff', cursor: 'pointer', marginTop: 8 }}>
          {loading ? 'Saving…' : 'Save Settings'}
        </button>

        {saved && (
          <div style={{ color: '#2dd48f', textAlign: 'center', marginTop: 12, fontSize: 14 }}>
            ✓ Settings saved
          </div>
        )}
      </form>
    </div>
  );
}

function FieldGroup({ label, hint, value, onChange, type = 'text', min, max }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, color: '#ccc', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#50505f', marginBottom: 6 }}>{hint}</div>
      <input
        type={type} value={value} onChange={onChange}
        min={min} max={max}
        style={{ display: 'block', width: '100%', padding: '12px', fontSize: 16, background: '#101016', border: '1px solid #2a2a3a', borderRadius: 10, color: '#f4f4f8', boxSizing: 'border-box' }}
      />
    </div>
  );
}

/**
 * Admin Login — Staff login with business ID
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '', business_id: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const upd = (f) => (e) => setForm((s) => ({ ...s, [f]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      await onLogin(form.email, form.password, form.business_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#08080c',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 60, fontWeight: 900, color: '#8b5cf6', lineHeight: 1 }}>Q</div>
          <div style={{ fontSize: 13, color: '#50505f', marginTop: 4, letterSpacing: 1 }}>STAFF PANEL</div>
        </div>

        <form onSubmit={handleSubmit}>
          {[['email', 'Email', 'email'], ['password', 'Password', 'password'], ['business_id', 'Business ID (UUID)', 'text']].map(([field, label, type]) => (
            <input key={field} type={type} placeholder={label} value={form[field]}
              onChange={upd(field)} required
              style={{ display: 'block', width: '100%', padding: '15px', fontSize: 16, background: '#101016', border: '1px solid #2a2a3a', borderRadius: 12, color: '#f4f4f8', marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
          ))}

          {error && <div style={{ color: '#ff4d6d', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>{error}</div>}

          <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
            style={{ width: '100%', padding: '17px', fontSize: 17, fontWeight: 700, background: '#8b5cf6', border: 'none', borderRadius: 14, color: '#fff', cursor: 'pointer' }}>
            {loading ? 'Signing in…' : 'Staff Sign In'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}

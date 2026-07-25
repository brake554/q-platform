import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth.js';
import QLogo from '../components/QLogo.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#08080c',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 380 }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <QLogo size={72} />
          <div style={{ fontSize: 14, color: '#50505f', marginTop: 4 }}>Skip the line</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ color: '#ff4d6d', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            style={buttonStyle}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </motion.button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, color: '#50505f', fontSize: 14 }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#8b5cf6', textDecoration: 'none' }}>Join Q</Link>
        </div>
      </motion.div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '16px', fontSize: 16,
  background: '#101016', border: '1px solid #2a2a3a',
  borderRadius: 12, color: '#f4f4f8', outline: 'none',
  boxSizing: 'border-box',
};

const buttonStyle = {
  width: '100%', padding: '18px', fontSize: 18, fontWeight: 700,
  background: 'linear-gradient(135deg, #8b5cf6, #d946ef)', border: 'none', borderRadius: 999,
  color: '#fff', cursor: 'pointer', letterSpacing: 0.5,
  boxShadow: '0 8px 32px rgba(139,92,246,0.35)',
};

/**
 * Register — Multi-step: email/phone/DOB → OTP → ID upload → pending
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

const STEPS = ['details', 'otp', 'upload', 'pending'];

export default function Register() {
  const { register, verifyOtp, uploadId, login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('details');
  const [form, setForm] = useState({ email: '', phone: '', password: '', full_name: '', date_of_birth: '' });
  const [otp, setOtp] = useState('');
  const [selfie, setSelfie] = useState(null);
  const [idDoc, setIdDoc] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const upd = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleDetails(e) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      await register(form);
      setStep('otp');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleOtp(e) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      await verifyOtp(form.phone, otp);
      setStep('upload');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!selfie || !idDoc) { setError('Please select both images'); return; }
    setError(null); setLoading(true);
    try {
      await uploadId(selfie, idDoc);
      setStep('pending');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div style={{
      minHeight: '100dvh', background: '#08080c',
      display: 'flex', flexDirection: 'column',
      padding: '24px', maxWidth: 420, margin: '0 auto',
    }}>
      {/* Progress bar */}
      <div style={{ height: 4, background: '#16161f', borderRadius: 2, marginBottom: 40, marginTop: 20 }}>
        <motion.div
          animate={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }}
          style={{ height: '100%', background: '#8b5cf6', borderRadius: 2 }}
        />
      </div>

      <AnimatePresence mode="wait">
        {step === 'details' && (
          <motion.form key="details" {...fadeSlide} onSubmit={handleDetails}>
            <h1 style={h1}>Join Q</h1>
            <p style={sub}>Your digital spot in line — for any business, anywhere.</p>

            {[
              ['full_name', 'Full Name', 'text'],
              ['email', 'Email', 'email'],
              ['phone', 'Phone Number (+1...)', 'tel'],
              ['date_of_birth', 'Date of Birth', 'date'],
              ['password', 'Password (8+ chars)', 'password'],
            ].map(([field, label, type]) => (
              <input key={field} type={type} placeholder={label}
                value={form[field]} onChange={upd(field)} required style={inputStyle} />
            ))}

            <p style={{ fontSize: 12, color: '#50505f', margin: '8px 0 20px' }}>
              Must be 18+. Your ID will be verified before your account is activated.
            </p>
            {error && <ErrMsg msg={error} />}
            <Btn loading={loading} label="Create Account" />
          </motion.form>
        )}

        {step === 'otp' && (
          <motion.form key="otp" {...fadeSlide} onSubmit={handleOtp}>
            <h1 style={h1}>Verify Phone</h1>
            <p style={sub}>We sent a code to {form.phone}</p>
            <input type="text" inputMode="numeric" placeholder="6-digit code"
              value={otp} onChange={(e) => setOtp(e.target.value)} required style={inputStyle} />
            {error && <ErrMsg msg={error} />}
            <Btn loading={loading} label="Verify Code" />
          </motion.form>
        )}

        {step === 'upload' && (
          <motion.form key="upload" {...fadeSlide} onSubmit={handleUpload}>
            <h1 style={h1}>Verify Identity</h1>
            <p style={sub}>We need a selfie and a photo ID to confirm who you are. Images are stored securely and never shared.</p>

            <label style={labelStyle}>
              Selfie
              <input type="file" accept="image/*" capture="user"
                onChange={(e) => setSelfie(e.target.files[0])} style={{ marginTop: 8 }} />
              {selfie && <div style={{ color: '#2dd48f', fontSize: 13, marginTop: 4 }}>✓ {selfie.name}</div>}
            </label>

            <label style={{ ...labelStyle, marginTop: 16 }}>
              Government-Issued ID (front)
              <input type="file" accept="image/*" capture="environment"
                onChange={(e) => setIdDoc(e.target.files[0])} style={{ marginTop: 8 }} />
              {idDoc && <div style={{ color: '#2dd48f', fontSize: 13, marginTop: 4 }}>✓ {idDoc.name}</div>}
            </label>

            {error && <ErrMsg msg={error} />}
            <Btn loading={loading} label="Submit for Review" />
          </motion.form>
        )}

        {step === 'pending' && (
          <motion.div key="pending" {...fadeSlide} style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 64, marginBottom: 24 }}>⏳</div>
            <h1 style={h1}>You're on the list</h1>
            <p style={sub}>Your ID is under review. We'll notify you when your account is approved — usually within a few hours.</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/login')}
              style={{ ...buttonStyle, marginTop: 40 }}
            >
              Back to Sign In
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ErrMsg({ msg }) {
  return <div style={{ color: '#ff4d6d', fontSize: 14, margin: '8px 0 12px', textAlign: 'center' }}>{msg}</div>;
}

function Btn({ loading, label }) {
  return (
    <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }} style={{ ...buttonStyle, marginTop: 8 }}>
      {loading ? 'Please wait…' : label}
    </motion.button>
  );
}

const fadeSlide = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -30 },
  transition: { duration: 0.25 },
  style: { flex: 1 },
};

const h1    = { fontSize: 28, fontWeight: 800, color: '#f4f4f8', marginBottom: 8 };
const sub   = { fontSize: 15, color: '#777', marginBottom: 28, lineHeight: 1.5 };
const inputStyle = {
  display: 'block', width: '100%', padding: '15px', fontSize: 16,
  background: '#101016', border: '1px solid #2a2a3a', borderRadius: 12,
  color: '#f4f4f8', outline: 'none', marginBottom: 12, boxSizing: 'border-box',
};
const labelStyle = { display: 'block', fontSize: 14, color: '#aaa', padding: '12px', background: '#101016', borderRadius: 12, border: '1px dashed #2a2a3a' };
const buttonStyle = {
  display: 'block', width: '100%', padding: '18px', fontSize: 17, fontWeight: 700,
  background: '#8b5cf6', border: 'none', borderRadius: 14, color: '#fff', cursor: 'pointer',
};

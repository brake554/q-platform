/**
 * Dashboard — Occupancy + queue count + active alerts at a glance
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api/client.js';
import OccupancyBar from '../components/OccupancyBar.jsx';
import AlertBanner from '../components/AlertBanner.jsx';

export default function Dashboard({ businessId, alerts, occupancy: socketOccupancy, queueUpdated, acknowledgeAlert }) {
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [queueLength, setQueueLength] = useState(0);

  useEffect(() => {
    api.get(`/businesses/${businessId}`).then(setBusiness).catch(console.error);
  }, [businessId]);

  useEffect(() => {
    api.get(`/queues/${businessId}/active`)
      .then(({ entries }) => setQueueLength(entries?.length || 0))
      .catch(console.error);
  }, [businessId, queueUpdated]);

  if (!business) return <Loading />;

  const currentOccupancy = socketOccupancy ?? business.current_occupancy;

  return (
    <div>
      <AlertBanner alerts={alerts} onAcknowledge={acknowledgeAlert} />

      <div style={{ padding: '24px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f8', marginBottom: 4 }}>
          {business.name}
        </div>
        <div style={{ fontSize: 13, color: '#50505f', marginBottom: 24 }}>{business.category} • {business.address}</div>

        {/* Occupancy */}
        <OccupancyBar current={currentOccupancy} capacity={business.capacity} />

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '16px 0' }}>
          <StatCard icon="👥" label="In Queue" value={queueLength} color="#8b5cf6"
            onClick={() => navigate('/queue')} />
          <StatCard icon="⚠️" label="Active Alerts" value={alerts.length} color={alerts.length > 0 ? '#ff4d6d' : '#50505f'}
            onClick={() => navigate('/alerts')} />
          <StatCard icon="📋" label="Q Slots" value={`${business.q_slot_allocation} reserved`} color="#3b82f6" />
          <StatCard icon="⏱" label="Grace Period" value={`${business.grace_period_minutes} min`} color="#2dd48f" />
        </div>

        {/* Quick nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <NavRow icon="🔢" label="Manage Queue" path="/queue" navigate={navigate} />
          <NavRow icon="📅" label="Today's Bookings" path="/bookings" navigate={navigate} />
          <NavRow icon="🚫" label="Bans & Restrictions" path="/bans" navigate={navigate} />
          <NavRow icon="⚙️" label="Settings" path="/settings" navigate={navigate} />
          <NavRow icon="💰" label="Payouts" path="/payouts" navigate={navigate} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, onClick }) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        background: '#101016', border: '1px solid #1a1a26', borderRadius: 14,
        padding: '16px', cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#50505f', marginTop: 4 }}>{label}</div>
    </motion.div>
  );
}

function NavRow({ icon, label, path, navigate }) {
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(path)}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        background: '#101016', border: '1px solid #1a1a26',
        borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 15, color: '#ccc' }}>{label}</span>
      <span style={{ color: '#50505f' }}>›</span>
    </motion.div>
  );
}

function Loading() {
  return <div style={{ padding: 40, color: '#50505f', textAlign: 'center' }}>Loading…</div>;
}

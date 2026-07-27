/**
 * Home — Map view with live venue occupancy markers + nearby list
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/index.js';
import { useGeo } from '../hooks/useGeo.js';
import VenueCard from '../components/VenueCard.jsx';
import { MapIcon } from '../components/Icons.jsx';
import QLogo from '../components/QLogo.jsx';
import MapView from '../components/MapView.jsx';

export default function Home() {
  const navigate = useNavigate();
  const {
    userLocation, nearbyBusinesses, insideVenueIds, simulateMode,
    toggleSimulateMode, setSimulatedLocation,
  } = useStore((s) => ({
    userLocation: s.userLocation,
    nearbyBusinesses: s.nearbyBusinesses,
    insideVenueIds: s.insideVenueIds,
    simulateMode: s.simulateMode,
    toggleSimulateMode: s.toggleSimulateMode,
    setSimulatedLocation: s.setSimulatedLocation,
  }));
  const [view, setView] = useState('map'); // 'map' | 'list'
  const [category, setCategory] = useState('');

  useGeo(true);

  const filtered = category
    ? nearbyBusinesses.filter((b) => b.category === category)
    : nearbyBusinesses;

  const categories = ['nightlife', 'barbershop', 'salon', 'restaurant', 'tattoo', 'medical', 'clinic', 'pharmacy'];

  return (
    <div style={{ height: '100dvh', background: '#08080c', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 8px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        background: '#08080c', zIndex: 10,
      }}>
        <QLogo size={32} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setView('map')}
            style={tabBtn(view === 'map')}
          >Map</button>
          <button
            onClick={() => setView('list')}
            style={tabBtn(view === 'list')}
          >List</button>
        </div>
      </div>

      {/* Category filter chips */}
      <div style={{ padding: '8px 20px', overflowX: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
        <Chip label="All" active={!category} onClick={() => setCategory('')} />
        {categories.map((c) => (
          <Chip key={c} label={c[0].toUpperCase() + c.slice(1)} active={category === c} onClick={() => setCategory(c)} />
        ))}
      </div>

      {/* Map view */}
      {view === 'map' && (
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <MapView
            businesses={filtered}
            userLocation={userLocation}
            insideIds={insideVenueIds}
            simulateMode={simulateMode}
            onSelect={(b) => !simulateMode && navigate(`/business/${b.id}`)}
            onMapClick={(pos) => simulateMode && setSimulatedLocation(pos)}
          />

          {/* Walk-the-map control — drops your position to test geofences */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={toggleSimulateMode}
            style={{
              position: 'absolute', top: 12, left: 12, zIndex: 600,
              padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', backdropFilter: 'blur(8px)',
              background: simulateMode
                ? 'linear-gradient(135deg, #8b5cf6, #d946ef)'
                : 'rgba(16,16,22,0.86)',
              border: `1px solid ${simulateMode ? 'transparent' : '#2a2a3a'}`,
              color: simulateMode ? '#fff' : '#9a9aad',
              boxShadow: simulateMode ? '0 4px 18px rgba(139,92,246,0.45)' : 'none',
            }}
          >
            {simulateMode ? 'Tap the map to move' : 'Simulate location'}
          </motion.button>

          {/* Bottom sheet peek */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 500,
            background: 'linear-gradient(transparent, #08080c 55%)',
            padding: '48px 20px 76px',
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 13, color: '#50505f', marginBottom: 8 }}>
              {filtered.length} places near you
            </div>
            <div style={{ pointerEvents: 'auto' }}>
              {filtered.slice(0, 2).map((b, i) => (
                <VenueCard key={b.id} business={b} index={i} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 100px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#50505f', paddingTop: 60, fontSize: 15 }}>
              No businesses near you.<br />Try expanding the radius or check your location settings.
            </div>
          ) : (
            filtered.map((b, i) => <VenueCard key={b.id} business={b} index={i} />)
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        flexShrink: 0, padding: '8px 18px', borderRadius: 999, fontSize: 13,
        background: active ? 'linear-gradient(135deg, #8b5cf6, #d946ef)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'transparent' : '#2a2a3a'}`,
        boxShadow: active ? '0 4px 16px rgba(139,92,246,0.4)' : 'none',
        color: active ? '#fff' : '#9a9aad', cursor: 'pointer',
      }}
    >
      {label}
    </motion.button>
  );
}

const tabBtn = (active) => ({
  padding: '8px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  background: active ? 'linear-gradient(135deg, #8b5cf6, #d946ef)' : 'transparent',
  border: '1px solid ' + (active ? 'transparent' : '#2a2a3a'),
  boxShadow: active ? '0 4px 16px rgba(139,92,246,0.4)' : 'none',
  color: active ? '#fff' : '#6b6b80',
});

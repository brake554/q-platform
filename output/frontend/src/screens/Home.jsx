/**
 * Home — Map view with live venue occupancy markers + nearby list
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { motion } from 'framer-motion';
import { useStore } from '../store/index.js';
import { useGeo } from '../hooks/useGeo.js';
import VenueCard from '../components/VenueCard.jsx';

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const HAS_MAPS = Boolean(GOOGLE_MAPS_KEY);

function OccupancyPin({ pct }) {
  const color = pct >= 90 ? '#ff4d6d' : pct >= 70 ? '#f5a524' : '#2dd48f';
  return (
    <div style={{
      background: color, borderRadius: '50% 50% 50% 0',
      transform: 'rotate(-45deg)', width: 32, height: 32,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    }}>
      <span style={{ transform: 'rotate(45deg)', fontSize: 10, fontWeight: 700, color: '#fff' }}>
        {pct}%
      </span>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { userLocation, nearbyBusinesses } = useStore((s) => ({
    userLocation: s.userLocation,
    nearbyBusinesses: s.nearbyBusinesses,
  }));
  const [view, setView] = useState(HAS_MAPS ? 'map' : 'list'); // 'map' | 'list'
  const [category, setCategory] = useState('');

  useGeo(true);

  const defaultCenter = userLocation || { lat: 43.6532, lng: -79.3832 }; // Toronto default

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
        <div style={{ fontSize: 32, fontWeight: 900, color: '#8b5cf6' }}>Q</div>
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
      {view === 'map' && !HAS_MAPS && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#50505f', gap: 8, padding: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40 }}>🗺️</div>
          <div style={{ fontSize: 15, color: '#9a9aad' }}>Map unavailable</div>
          <div style={{ fontSize: 13, maxWidth: 280 }}>
            Add VITE_GOOGLE_MAPS_API_KEY to frontend/.env to enable the live map. Showing the list instead.
          </div>
          <button onClick={() => setView('list')} style={{ ...tabBtn(true), marginTop: 12 }}>
            View list
          </button>
        </div>
      )}
      {view === 'map' && HAS_MAPS && (
        <div style={{ flex: 1, position: 'relative' }}>
          <APIProvider apiKey={GOOGLE_MAPS_KEY}>
            <Map
              defaultCenter={defaultCenter}
              defaultZoom={14}
              mapId="q-dark-map"
              style={{ width: '100%', height: '100%' }}
              colorScheme="DARK"
            >
              {/* User position */}
              {userLocation && (
                <AdvancedMarker position={userLocation}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#8b5cf6', border: '3px solid #fff',
                    boxShadow: '0 0 12px rgba(139,92,246,0.6)',
                  }} />
                </AdvancedMarker>
              )}

              {/* Business markers */}
              {filtered.map((b) => (
                <AdvancedMarker
                  key={b.id}
                  position={{ lat: parseFloat(b.lat || defaultCenter.lat), lng: parseFloat(b.lng || defaultCenter.lng) }}
                  onClick={() => navigate(`/business/${b.id}`)}
                >
                  <OccupancyPin pct={b.occupancy_pct || 0} />
                </AdvancedMarker>
              ))}
            </Map>
          </APIProvider>

          {/* Bottom sheet peek */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, #08080c)',
            padding: '48px 20px 20px',
          }}>
            <div style={{ fontSize: 13, color: '#50505f', marginBottom: 8 }}>
              {filtered.length} places near you
            </div>
            {filtered.slice(0, 2).map((b) => (
              <VenueCard key={b.id} business={b} />
            ))}
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
            filtered.map((b) => <VenueCard key={b.id} business={b} />)
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

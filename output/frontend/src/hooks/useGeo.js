/**
 * useGeo hook
 *
 * Manages continuous GPS position tracking.
 * Reports position to backend every 30 seconds for geo-fence detection.
 * Fetches nearby businesses when position changes significantly.
 */

import { useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client.js';
import { useStore } from '../store/index.js';

const CHECK_IN_INTERVAL_MS = 30_000;  // Report position every 30s
const NEARBY_RADIUS_KM = 5;
const MIN_POSITION_CHANGE_M = 50;    // Only re-fetch if moved > 50m

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGeo(enabled = true) {
  const { userLocation, setUserLocation, setNearbyBusinesses, user } = useStore();
  const lastReportedPos = useRef(null);
  const checkInTimer = useRef(null);
  const watchId = useRef(null);

  const fetchNearby = useCallback(async (lat, lng) => {
    try {
      const { businesses } = await api.get(
        `/geo/businesses/nearby?lat=${lat}&lng=${lng}&radius=${NEARBY_RADIUS_KM}`
      );
      setNearbyBusinesses(businesses);
    } catch {
      // Non-fatal — user just won't see nearby list
    }
  }, [setNearbyBusinesses]);

  const reportPosition = useCallback(async (lat, lng) => {
    if (!user) return;
    try {
      await api.post('/geo/checkin', { lat, lng });
    } catch {
      // Non-fatal — geo-fence updates are best-effort
    }
  }, [user]);

  const handlePosition = useCallback((position) => {
    const { latitude: lat, longitude: lng } = position.coords;
    const prev = lastReportedPos.current;

    setUserLocation({ lat, lng });

    // Fetch nearby businesses if moved significantly or first time
    if (!prev || haversineDistance(prev.lat, prev.lng, lat, lng) > MIN_POSITION_CHANGE_M) {
      fetchNearby(lat, lng);
    }

    lastReportedPos.current = { lat, lng };
  }, [fetchNearby, setUserLocation]);

  useEffect(() => {
    if (!enabled) return;

    // Immediately seed with default location so businesses show without waiting for GPS
    const DEFAULT_LAT = 43.6532;
    const DEFAULT_LNG = -79.3832;
    fetchNearby(DEFAULT_LAT, DEFAULT_LNG);

    if (!navigator.geolocation) return;

    // Watch position for real-time updates
    watchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => console.warn('[Geo] Position error:', err.message),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 5_000 }
    );

    // Report to backend on interval (for geo-fence processing)
    checkInTimer.current = setInterval(() => {
      const pos = lastReportedPos.current;
      if (pos) reportPosition(pos.lat, pos.lng);
    }, CHECK_IN_INTERVAL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId.current);
      clearInterval(checkInTimer.current);
    };
  }, [enabled, handlePosition, reportPosition]);

  return { userLocation };
}

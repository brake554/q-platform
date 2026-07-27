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
import { CITY_CENTER } from '../data/stjohns.js';

const CHECK_IN_INTERVAL_MS = 30_000;  // Report position every 30s
const NEARBY_RADIUS_KM = 5;
const MIN_POSITION_CHANGE_M = 50;    // Only re-fetch if moved > 50m
const GEOFENCE_MOVE_M = 8;           // Re-evaluate fences after a small move

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
  const { userLocation, setUserLocation, setNearbyBusinesses, user, simulatedLocation } = useStore();
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
      const res = await api.post('/geo/checkin', { lat, lng });
      const st = useStore.getState();

      if (res?.businesses?.length) st.applyVenueState(res.businesses);
      if (res?.inside) st.setInsideVenueIds(res.inside);

      // Queue moved up while we were away
      if (res?.queueUpdate && st.currentQueue?.businessId === res.queueUpdate.businessId) {
        st.setCurrentQueue({ ...st.currentQueue, position: res.queueUpdate.position });
      }

      for (const ev of res?.events || []) {
        const type =
          ev.type === 'admitted' || ev.type === 'your_turn' ? 'success'
          : ev.type === 'slot_filled' ? 'info'
          : ev.type === 'arrived_early' ? 'warning'
          : 'info';
        st.addNotification({ type, message: ev.message, data: ev });

        // Being admitted clears the queue card we were holding
        if (ev.type === 'admitted' && st.currentQueue?.businessId === ev.businessId) {
          st.clearQueue();
          st.clearTimer();
        }
        // It's our turn — run the admission countdown
        if (ev.type === 'your_turn') {
          st.setTimerState({ businessId: ev.businessId, startedAt: Date.now() });
        }
      }
    } catch {
      // Non-fatal — geo-fence updates are best-effort
    }
  }, [user]);

  const handlePosition = useCallback((position) => {
    const { latitude: lat, longitude: lng } = position.coords;
    const prev = lastReportedPos.current;

    setUserLocation({ lat, lng });

    const moved = !prev || haversineDistance(prev.lat, prev.lng, lat, lng) > MIN_POSITION_CHANGE_M;

    // Fetch nearby businesses if moved significantly or first time
    if (moved) fetchNearby(lat, lng);

    // Crossing a fence should register immediately, not on the next 30s tick
    if (!prev || haversineDistance(prev.lat, prev.lng, lat, lng) > GEOFENCE_MOVE_M) {
      reportPosition(lat, lng);
    }

    lastReportedPos.current = { lat, lng };
  }, [fetchNearby, setUserLocation, reportPosition]);

  useEffect(() => {
    if (!enabled) return;

    // Immediately seed with the launch city so businesses show without waiting for GPS
    fetchNearby(CITY_CENTER.lat, CITY_CENTER.lng);

    // In simulate mode the map drives our position instead of the GPS
    if (simulatedLocation) return;

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
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      clearInterval(checkInTimer.current);
    };
  }, [enabled, handlePosition, reportPosition, simulatedLocation]);

  // Simulated moves run through the exact same pipeline as real GPS fixes
  useEffect(() => {
    if (!simulatedLocation) return;
    handlePosition({ coords: { latitude: simulatedLocation.lat, longitude: simulatedLocation.lng } });
  }, [simulatedLocation, handlePosition]);

  return { userLocation };
}

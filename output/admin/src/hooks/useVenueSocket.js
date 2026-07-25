/**
 * useVenueSocket — connects staff to the business Socket.io room
 * and provides real-time event callbacks.
 */

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useVenueSocket(businessId, token) {
  const socketRef = useRef(null);
  const [alerts, setAlerts] = useState([]);    // ban geo-fence alerts
  const [occupancy, setOccupancy] = useState(null);
  const [queueUpdated, setQueueUpdated] = useState(0);  // increment to trigger re-fetch

  useEffect(() => {
    if (!businessId || !token) return;

    const socket = io({
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('join:business_room', { businessId });
    });

    // Queue updated — increment counter so subscribers re-fetch
    socket.on('queue:updated', ({ businessId: bid }) => {
      if (bid === businessId) setQueueUpdated((n) => n + 1);
    });

    // Occupancy change
    socket.on('occupancy:update', ({ businessId: bid, occupancy: occ }) => {
      if (bid === businessId) setOccupancy(occ);
    });

    // Ban geo-fence alert
    socket.on('ban:geofence_alert', (payload) => {
      if (payload.businessId === businessId) {
        setAlerts((prev) => [
          { ...payload, id: Date.now(), acknowledged: false },
          ...prev,
        ]);
        // Auto-dismiss after 60s
        setTimeout(() => {
          setAlerts((prev) => prev.filter((a) => a.id !== Date.now()));
        }, 60000);
      }
    });

    socketRef.current = socket;

    return () => {
      socket.emit('leave:business_room', { businessId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [businessId, token]);

  function acknowledgeAlert(id) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  return { socket: socketRef.current, alerts, occupancy, queueUpdated, acknowledgeAlert };
}

/**
 * useQueue hook
 *
 * Manages queue state for a specific business.
 * Subscribes to socket events and syncs with Zustand store.
 */

import { useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client.js';
import { useStore } from '../store/index.js';

export function useQueue(businessId, socket) {
  const { setCurrentQueue, clearQueue, setTimerState, clearTimer, addNotification } = useStore();
  const pollRef = useRef(null);

  const fetchPosition = useCallback(async () => {
    if (!businessId) return;
    try {
      const position = await api.get(`/queues/${businessId}/position`);
      if (position) {
        setCurrentQueue({ ...position, businessId });
      } else {
        clearQueue();
      }
    } catch {
      clearQueue();
    }
  }, [businessId, setCurrentQueue, clearQueue]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!socket || !businessId) return;

    const onQueueUpdated = ({ businessId: bid }) => {
      if (bid === businessId) fetchPosition();
    };

    const onTimerStart = ({ entryId, businessId: bid, seconds, startedAt }) => {
      if (bid === businessId) {
        setTimerState({ businessId: bid, seconds, startedAt });
        setCurrentQueue((prev) => ({ ...prev, status: 'timer_active' }));
        addNotification({ type: 'timer', message: `You're up! ${seconds} seconds to confirm entry.` });
      }
    };

    const onTimerExpired = ({ businessId: bid, message }) => {
      if (bid === businessId) {
        clearTimer();
        fetchPosition(); // Get new back-of-queue position
        addNotification({ type: 'warning', message });
      }
    };

    const onAdmitted = ({ businessId: bid, message, newScore }) => {
      if (bid === businessId) {
        clearTimer();
        clearQueue();
        addNotification({ type: 'success', message });
      }
    };

    const onRemoved = ({ businessId: bid, message }) => {
      if (bid === businessId) {
        clearQueue();
        clearTimer();
        addNotification({ type: 'error', message });
      }
    };

    socket.on('queue:updated', onQueueUpdated);
    socket.on('queue:timer_start', onTimerStart);
    socket.on('queue:timer_expired', onTimerExpired);
    socket.on('queue:admitted', onAdmitted);
    socket.on('queue:removed', onRemoved);

    return () => {
      socket.off('queue:updated', onQueueUpdated);
      socket.off('queue:timer_start', onTimerStart);
      socket.off('queue:timer_expired', onTimerExpired);
      socket.off('queue:admitted', onAdmitted);
      socket.off('queue:removed', onRemoved);
    };
  }, [socket, businessId, fetchPosition, setTimerState, clearTimer, setCurrentQueue, clearQueue, addNotification]);

  // Initial fetch
  useEffect(() => {
    fetchPosition();
  }, [fetchPosition]);

  const joinQueue = useCallback(async (partySize = 1) => {
    const result = await api.post(`/queues/${businessId}/join`, { partySize });
    await fetchPosition();
    return result;
  }, [businessId, fetchPosition]);

  const leaveQueue = useCallback(async () => {
    await api.delete(`/queues/${businessId}/leave`);
    clearQueue();
  }, [businessId, clearQueue]);

  const confirmEntry = useCallback(async () => {
    const result = await api.post(`/queues/${businessId}/confirm-entry`);
    clearTimer();
    clearQueue();
    return result;
  }, [businessId, clearTimer, clearQueue]);

  return { fetchPosition, joinQueue, leaveQueue, confirmEntry };
}

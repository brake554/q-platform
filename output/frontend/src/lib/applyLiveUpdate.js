/**
 * Applies a live venue update to the store.
 *
 * Both the geofence check-in and the demo "someone leaves" control return the
 * same shape, so admission, queue movement and toasts behave identically
 * whichever one produced the event.
 */

import { useStore } from '../store/index.js';

const TOAST_TYPE = {
  admitted: 'success',
  your_turn: 'success',
  slot_filled: 'info',
  patron_left: 'info',
  exited: 'info',
  arrived_early: 'warning',
};

export function applyLiveUpdate(res) {
  if (!res) return;
  const st = useStore.getState();

  if (res.businesses?.length) st.applyVenueState(res.businesses);
  if (res.inside) st.setInsideVenueIds(res.inside);

  if (res.queueUpdate && st.currentQueue?.businessId === res.queueUpdate.businessId) {
    st.setCurrentQueue({ ...st.currentQueue, position: res.queueUpdate.position });
  }

  for (const ev of res.events || []) {
    st.addNotification({ type: TOAST_TYPE[ev.type] || 'info', message: ev.message, data: ev });

    // Getting admitted retires the queue card and any running countdown
    if (ev.type === 'admitted' && useStore.getState().currentQueue?.businessId === ev.businessId) {
      st.clearQueue();
      st.clearTimer();
    }
    // Reaching the front starts the admission countdown
    if (ev.type === 'your_turn') {
      st.setTimerState({ businessId: ev.businessId, startedAt: Date.now() });
    }
  }
}

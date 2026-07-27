/**
 * Global State (Zustand)
 *
 * auth slice   — user, accessToken, login/logout actions
 * queue slice  — current queue position, timer state
 * geo slice    — user GPS position, nearby businesses
 * ui slice     — active notifications list
 */

import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // ── Auth ──────────────────────────────────────────────────────────────────
  user:        null,
  accessToken: null,
  isLoading:   true,  // true until /auth/me resolves on startup

  setUser: (user)         => set({ user }),
  setToken: (accessToken) => set({ accessToken }),

  login: (user, accessToken) => set({ user, accessToken, isLoading: false }),

  logout: () => set({ user: null, accessToken: null }),

  setLoading: (isLoading) => set({ isLoading }),

  // ── Queue ─────────────────────────────────────────────────────────────────
  currentQueue: null,          // { entryId, position, status, businessId, businessName }
  timerState: null,            // { businessId, seconds, startedAt } | null

  setCurrentQueue: (q)      => set({ currentQueue: q }),
  clearQueue:       ()      => set({ currentQueue: null }),
  setTimerState:    (timer) => set({ timerState: timer }),
  clearTimer:       ()      => set({ timerState: null }),

  // ── Geo ───────────────────────────────────────────────────────────────────
  userLocation: null,          // { lat, lng }
  nearbyBusinesses: [],
  insideVenueIds: [],          // venues whose geofence currently contains us
  simulatedLocation: null,     // demo override for userLocation
  simulateMode: false,         // tap-the-map-to-move, for testing geofences

  setUserLocation:     (loc)  => set({ userLocation: loc }),
  setNearbyBusinesses: (list) => set({ nearbyBusinesses: list }),
  setInsideVenueIds:   (ids)  => set({ insideVenueIds: ids }),
  setSimulatedLocation: (loc) => set({ simulatedLocation: loc, userLocation: loc }),
  toggleSimulateMode:  ()     => set((s) => ({ simulateMode: !s.simulateMode })),

  /** Merge live occupancy/queue counts from a geofence check-in. */
  applyVenueState: (updates) => set((state) => {
    if (!updates?.length) return {};
    const byId = new Map(updates.map((u) => [u.id, u]));
    return {
      nearbyBusinesses: state.nearbyBusinesses.map((b) =>
        byId.has(b.id) ? { ...b, ...byId.get(b.id) } : b
      ),
    };
  }),

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: [],           // [{ id, type, message, data, timestamp }]

  addNotification: (notif) => set((state) => ({
    notifications: [
      { id: Date.now(), timestamp: new Date().toISOString(), ...notif },
      ...state.notifications,
    ].slice(0, 50), // Cap at 50
  })),

  clearNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((n) => n.id !== id),
  })),

  clearAllNotifications: () => set({ notifications: [] }),
}));

// Convenience selectors
export const selectUser         = (s) => s.user;
export const selectToken        = (s) => s.accessToken;
export const selectCurrentQueue = (s) => s.currentQueue;
export const selectTimerState   = (s) => s.timerState;
export const selectLocation     = (s) => s.userLocation;
export const selectNotifications = (s) => s.notifications;

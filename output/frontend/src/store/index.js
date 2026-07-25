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

  setUserLocation:     (loc)  => set({ userLocation: loc }),
  setNearbyBusinesses: (list) => set({ nearbyBusinesses: list }),

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

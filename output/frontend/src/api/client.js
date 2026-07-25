/**
 * API Client
 *
 * Centralized fetch wrapper with:
 * - JWT access token injection (from Zustand store)
 * - Automatic token refresh on 401
 * - Error normalization
 * - Demo mode: routes through mock.js when no backend is available
 */

import { mockFetch } from './mock.js';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Demo mode: always on when VITE_DEMO_MODE=true OR when backend is unreachable
let _demoMode = import.meta.env.VITE_DEMO_MODE === 'true';
let _probePromise = null;

function probeBackend() {
  if (!_probePromise) {
    _probePromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(1500) });
        _demoMode = !res.ok;
      } catch {
        _demoMode = true;
      }
    })();
  }
  return _probePromise;
}

// Kick off probe immediately (non-blocking)
probeBackend();

let _getToken = () => null;
let _setToken = () => {};
let _logout   = () => {};

/**
 * Inject auth store accessors to avoid circular deps.
 * Called once from App.jsx after store is initialized.
 */
export function initApiAuth(getToken, setToken, logout) {
  _getToken = getToken;
  _setToken = setToken;
  _logout   = logout;
}

async function request(method, path, body = null, options = {}) {
  // Wait for backend probe before first real request
  await probeBackend();

  if (_demoMode) {
    const result = await mockFetch(path, method, body);
    if (!result.ok) {
      throw Object.assign(new Error(result.data?.error || 'Request failed'), {
        status: result.status,
        data: result.data,
      });
    }
    return result.data;
  }

  const token = _getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include', // Send httpOnly refresh cookie
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });

  // Token expired — attempt refresh
  if (res.status === 401 && !options._isRetry) {
    try {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (refreshRes.ok) {
        const { accessToken } = await refreshRes.json();
        _setToken(accessToken);
        return request(method, path, body, { ...options, _isRetry: true });
      }
    } catch {
      // Refresh failed — force logout
    }
    _logout();
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw Object.assign(new Error(err.error || err.message || 'Request failed'), {
      status: res.status,
      data: err,
    });
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get:    (path, opts)       => request('GET',    path, null, opts),
  post:   (path, body, opts) => request('POST',   path, body, opts),
  patch:  (path, body, opts) => request('PATCH',  path, body, opts),
  delete: (path, opts)       => request('DELETE', path, null, opts),
};

// Multipart upload helper (no JSON Content-Type)
export async function uploadFiles(path, formData) {
  await probeBackend();

  if (_demoMode) {
    const result = await mockFetch(path, 'POST', {});
    if (!result.ok) throw new Error(result.data?.error || 'Upload failed');
    return result.data;
  }

  const token = _getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

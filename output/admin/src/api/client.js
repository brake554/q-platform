/**
 * Admin API Client — same pattern as frontend client
 */

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

let _token = null;
let _onExpired = () => {};

export function setAdminToken(token) { _token = token; }
export function onTokenExpired(fn) { _onExpired = fn; }

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers, credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Attempt refresh
    const ref = await fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (ref.ok) {
      const { accessToken } = await ref.json();
      _token = accessToken;
      return request(method, path, body);
    }
    _onExpired();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status });
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get:    (path)       => request('GET',    path),
  post:   (path, body) => request('POST',   path, body),
  patch:  (path, body) => request('PATCH',  path, body),
  delete: (path)       => request('DELETE', path),
};

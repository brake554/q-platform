import { useState, useEffect, useRef } from 'react';
import { api, setAdminToken, onTokenExpired } from '../api/client.js';

export function useAdminAuth() {
  const [user, setUser] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [loading, setLoading] = useState(true);
  // Expose the raw token so useVenueSocket can authenticate the socket connection
  const tokenRef = useRef(null);

  useEffect(() => {
    onTokenExpired(() => { setUser(null); });

    // Attempt session restore
    api.post('/auth/refresh')
      .then(({ accessToken }) => {
        setAdminToken(accessToken);
        tokenRef.current = accessToken;
        return api.get('/auth/me');
      })
      .then((u) => {
        setUser(u);
        // Restore saved businessId from sessionStorage
        const saved = sessionStorage.getItem('q_admin_business_id');
        if (saved) setBusinessId(saved);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password, bid) {
    const { accessToken, user: u } = await api.post('/auth/venue/login', {
      email, password, business_id: bid,
    });
    setAdminToken(accessToken);
    tokenRef.current = accessToken;
    setUser(u);
    setBusinessId(bid);
    sessionStorage.setItem('q_admin_business_id', bid);
  }

  function logout() {
    api.post('/auth/logout').catch(() => {});
    setUser(null);
    setBusinessId(null);
    tokenRef.current = null;
    sessionStorage.removeItem('q_admin_business_id');
  }

  // token is exposed so useVenueSocket can authenticate the Socket.io connection
  return { user, businessId, loading, login, logout, token: tokenRef.current };
}

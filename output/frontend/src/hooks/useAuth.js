/**
 * useAuth hook
 *
 * Handles: login, logout, registration steps, token refresh, current user fetch.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFiles } from '../api/client.js';
import { useStore } from '../store/index.js';

export function useAuth() {
  const { user, accessToken, isLoading, login, logout: storeLogout, setToken, setLoading } = useStore();
  const navigate = useNavigate();

  const fetchMe = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      useStore.getState().setUser(data);
      useStore.getState().setLoading(false);
    } catch {
      useStore.getState().setLoading(false);
    }
  }, []);

  const handleLogin = useCallback(async (email, password) => {
    const { accessToken: token, user } = await api.post('/auth/login', { email, password });
    login(user, token);
    navigate('/');
  }, [login, navigate]);

  const handleLogout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch {}
    storeLogout();
    navigate('/login');
  }, [storeLogout, navigate]);

  const handleRegister = useCallback(async (formData) => {
    const { userId } = await api.post('/auth/register', formData);
    return userId;
  }, []);

  const handleVerifyOtp = useCallback(async (phone, code) => {
    return api.post('/auth/verify-otp', { phone, code });
  }, []);

  const handleUploadId = useCallback(async (selfieFile, idDocFile) => {
    const fd = new FormData();
    fd.append('selfie', selfieFile);
    fd.append('id_doc', idDocFile);
    return uploadFiles('/auth/upload-id', fd);
  }, []);

  const handleStaffLogin = useCallback(async (email, password, businessId) => {
    const { accessToken: token, user } = await api.post('/auth/venue/login', {
      email, password, business_id: businessId,
    });
    login(user, token);
    navigate('/admin');
  }, [login, navigate]);

  return {
    user,
    accessToken,
    isLoading,
    isAuthenticated: !!user,
    isVerified: user?.is_verified === true,
    fetchMe,
    login: handleLogin,
    logout: handleLogout,
    register: handleRegister,
    verifyOtp: handleVerifyOtp,
    uploadId: handleUploadId,
    staffLogin: handleStaffLogin,
  };
}

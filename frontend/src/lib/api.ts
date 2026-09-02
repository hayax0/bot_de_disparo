import axios from 'axios';

const baseURL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000,
});

// Interceptor para injetar automaticamente o Token JWT
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor para capturar 401 (token expirado) e redirecionar
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

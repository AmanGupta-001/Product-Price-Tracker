// src/api.js — Axios instance pre-configured for the backend.
// In production (Vercel), VITE_API_URL must point to the Render backend URL.
// In local dev, it falls back to '/api' which is proxied by Vite to localhost:3001.
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 60_000, // Playwright scrapes can take up to ~30s per attempt × 2
});

export default api;

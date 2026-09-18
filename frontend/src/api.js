// src/api.js — Axios instance pre-configured for the backend.
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60_000, // Playwright scrapes can take up to ~30s per attempt × 2
});

export default api;

// server.js — Express entry point for the INE Price Tracker backend.
// Runs on Render (production) or locally (dev).
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const routes = require('./src/routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Allow requests from the Vite dev server and the deployed Vercel frontend.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL, // set in Render env vars after Vercel deploy
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser requests (curl, Postman, cron-job.org pings).
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());

// Health check — used by Render's health-check ping to keep the service warm.
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api', routes);

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});

# INE Price Tracker

A full-stack product price & stock monitoring tool built for the INE Software Engineer Intern assignment.

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌──────────────────────┐
│  React Frontend     │    │  Express Backend     │    │  Supabase (Postgres) │
│  (Vite, Recharts)   │◄──►│  Node.js + Playwright│◄──►│  3 tables + 1 view   │
│  Deploy: Vercel     │    │  Deploy: Render      │    │  Hosted: Supabase    │
└─────────────────────┘    └─────────────────────┘    └──────────────────────┘
                                       ▲
                                       │ POST /api/scrape/run
                                 ┌─────┴────────┐
                                 │ cron-job.org │
                                 │  (schedule)  │
                                 └──────────────┘
```

## Project Structure

```
├── src/
│   ├── scraper/
│   │   ├── catalogClient.js    # Fetches /api/catalog for product search
│   │   ├── productScraper.js   # Playwright scraper (handles WASM/encrypted price)
│   │   └── scrapeRunner.js     # Bridges scraper output → Supabase DB
│   ├── db.js                   # Supabase client
│   └── routes.js               # Express route definitions
├── frontend/                   # React (Vite) app
│   └── src/
│       ├── pages/
│       │   ├── DashboardPage.jsx   # Tracked products grid
│       │   ├── SearchPage.jsx      # Search & track products
│       │   └── ProductPage.jsx     # Price chart + scrape logs
│       └── components/
│           ├── Navbar.jsx
│           ├── ProductCard.jsx
│           ├── PriceChart.jsx      # Recharts line chart
│           ├── ScrapeLog.jsx       # Attempt-level log table
│           └── StockBadge.jsx
├── schema.sql                  # Supabase schema (run once)
├── server.js                   # Express entry point
├── package.json
└── .env.example
```

## Local Setup

### 1. Database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and paste the contents of `schema.sql`. Run it.
3. Copy your **Project URL** and **service_role key** from Project Settings → API.

### 2. Backend

```bash
# In the project root:
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET

npm install
npx playwright install chromium   # Download Chromium for Playwright

npm run dev      # starts on http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev      # starts on http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:3001` automatically.

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/products/search?q=` | — | Search catalog |
| `POST` | `/api/products/track` | — | Start tracking a product |
| `GET` | `/api/products/tracked` | — | All tracked products + latest prices |
| `POST` | `/api/products/:id/scrape` | — | Manual scrape trigger |
| `GET` | `/api/products/:id/history` | — | Full price history |
| `GET` | `/api/products/:id/logs` | — | All scrape attempt logs |
| `POST` | `/api/scrape/run` | `X-Cron-Secret` header | Cron-triggered batch scrape |

## Deployment

### Backend → Render

1. Push code to GitHub.
2. Create a new **Web Service** on Render, point to your repo.
3. Set **Build Command**: `npm install && npx playwright install chromium --with-deps`
4. Set **Start Command**: `node server.js`
5. Add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORE_BASE_URL`, `CRON_SECRET`, `FRONTEND_URL`.

### Frontend → Vercel

1. Create a new project on Vercel, import the `frontend/` directory (set **Root Directory** to `frontend`).
2. Add env var: `VITE_API_BASE_URL=https://your-render-service.onrender.com/api`
3. Deploy.

### Cron Schedule → cron-job.org

1. Create a free account at [cron-job.org](https://cron-job.org).
2. Add a new cron job:
   - **URL**: `https://your-render-service.onrender.com/api/scrape/run`
   - **Method**: POST
   - **Custom Header**: `X-Cron-Secret: <your CRON_SECRET value>`
   - **Schedule**: Every 2 hours (or as needed)

## Scraping Design Notes

### Why Playwright (not plain HTTP)

The product page at `https://demo.inelabteamdev.com/product/{id}` uses a challenge → session → encrypted price flow:

1. **`/api/challenge`** returns a WASM proof-of-work blob.
2. **`/api/session`** requires a solved nonce + browser fingerprint (canvas hash, GL renderer, screen geometry, frame timings).
3. **`/price`** response is an encrypted blob that only the store's own JavaScript decrypts into the DOM.

There is no plaintext price obtainable over plain HTTP. Playwright loads the real page and lets the store's own bundle run the handshake, then reads the rendered DOM.

### Reliability Strategy

- **Retry-by-reload**: each retry is a full new Playwright context (fresh challenge/session), because a stale token can't be reused. Max 4 attempts with exponential backoff (1.5s, 3s, 6s).
- **Positional selector avoidance**: the DOM reshuffles on every load. Prices are found by regex pattern (`₹ + digits`) + computed style (`text-decoration-line: line-through` = original/crossed-out price).
- **Plausibility guard** (`scrapeRunner.js`): a price that jumps >10× or drops >90% from the last reading is rejected and logged without writing to `price_history`.
- **Honest logging**: every attempt (success, retried, failed) gets a row in `scrape_logs`. Only validated, plausible successes write to `price_history`.

### Trade-offs

| Decision | Rationale |
|---|---|
| Sequential scraping (not parallel) | Each Playwright launch is ~200–400 MB RAM; the free Render instance can't sustain multiple concurrent Chromium processes. |
| External cron (cron-job.org) instead of `setInterval` | Render's free tier spins down after inactivity. An external ping both wakes the service and triggers the scrape. |
| Per-attempt retry (full reload) | Session tokens expire in ~30 s; a network-only retry against a dead session always fails. Full reload = fresh token. |
| `latest_prices` view in DB | Avoids `ORDER BY … LIMIT 1` subqueries in every dashboard query. The view is computed once and indexed on `product_id`. |

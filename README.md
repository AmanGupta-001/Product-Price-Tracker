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
│   ├── alerts.js               # SendGrid email alerts (price drop & back-in-stock)
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
| `GET` | `/api/alerts/status` | — | SendGrid configuration status |
| `POST` | `/api/alerts/test` | `X-Cron-Secret` header | Send test price-drop alert email |

## Deployment

### Backend → Render

1. Push code to GitHub.
2. Create a new **Web Service** on Render, point to your repo.
3. Set **Build Command**: `npm install && npx playwright install chromium --with-deps`
4. Set **Start Command**: `node server.js`
5. Add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORE_BASE_URL`, `CRON_SECRET`, `FRONTEND_URL`.

### Frontend → Vercel

1. Create a new project on Vercel, import the `frontend/` directory (set **Root Directory** to `frontend`).
2. Add env var: `VITE_API_URL=https://your-render-service.onrender.com/api` (or `VITE_API_BASE_URL`, both are supported).
3. Deploy.

### Cron Schedule → cron-job.org

1. Create a free account at [cron-job.org](https://cron-job.org).
2. Add a new cron job:
   - **URL**: `https://your-render-service.onrender.com/api/scrape/run`
   - **Method**: POST
   - **Custom Header**: `X-Cron-Secret: <your CRON_SECRET value>`
   - **Schedule**: Every 2 hours (or as needed)

## Email Alerts (SendGrid)

The backend includes automated email notification service powered by `@sendgrid/mail`:

- **Price-Drop Alerts**: Fires whenever a newly scraped price is lower than the previous recorded price by at least `ALERT_THRESHOLD_PCT` (default `1%`). Formatted in INR with savings calculation and direct link.
- **Back-in-Stock Alerts**: Fires when an item transitions from out-of-stock (`in_stock: false`) to in-stock (`in_stock: true`).
- **Spam / Cooldown Protection**: Per-product cooldown (`ALERT_COOLDOWN_HOURS`, default `6h`) prevents email fatigue from frequent re-scrapes.
- **Fire-and-Forget**: Alert sending runs asynchronously in the background and will never block or fail the core scrape runner.

### Configuration
Set the following environment variables on Render / local `.env`:
```env
SENDGRID_API_KEY=SG.your_api_key_here
ALERT_EMAIL=recipient@example.com
FROM_EMAIL=verified_sender@example.com   # Must be a verified Single Sender or domain in SendGrid
ALERT_THRESHOLD_PCT=1                    # Min % drop to trigger alert (optional, default 1)
ALERT_COOLDOWN_HOURS=6                   # Min hours between alerts for same product (optional, default 6)
```

To test SendGrid configuration:
```bash
curl -X POST https://your-render-service.onrender.com/api/alerts/test \
  -H "X-Cron-Secret: your-cron-secret-here"
```

## Headed Scraper & Demo Recording

To inspect the scraper visually or record the required 2–4 minute video demo showing the automated browser interacting with the challenge and price reveal:

```bash
# Run against a specific product ID (e.g. product 1)
npm run scrape:headed 1

# Or run directly with Node:
node scripts/headedScrape.js 1
```

This launches Chromium in headed mode with slow-motion actions, showing:
1. Navigation to `demo.inelabteamdev.com/product/{id}`.
2. Background resolution of the WASM proof-of-work challenge and session handshake.
3. Cursor hover over the price trigger area.
4. Clicking "Reveal price" and waiting for client decryption into the DOM.
5. Extraction of current price, discount/MRP, and stock status.

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
- **Configurable Intervals** (`scrape_interval_minutes`): scheduled batch runs skip active products whose last reading was taken within their configured interval window, preventing redundant browser launches.

### Trade-offs

| Decision | Rationale |
|---|---|
| Sequential scraping (not parallel) | Each Playwright launch is ~200–400 MB RAM; the free Render instance can't sustain multiple concurrent Chromium processes. |
| External cron (cron-job.org) instead of `setInterval` | Render's free tier spins down after inactivity. An external ping both wakes the service and triggers the scrape. |
| Per-attempt retry (full reload) | Session tokens expire in ~30 s; a network-only retry against a dead session always fails. Full reload = fresh token. |
| `latest_prices` view in DB | Avoids `ORDER BY … LIMIT 1` subqueries in every dashboard query. The view is computed once and indexed on `product_id`. |

### What AI Tools Got Wrong & How They Were Corrected

During the design and implementation of this project, several AI tool suggestions required critical debugging and structural corrections:

1. **Attempting Plain HTTP / Cheerio Requests**:
   - *AI Suggestion*: AI initially generated straightforward `axios` requests scraping HTML with Cheerio or mimicking `/api/session` directly with static headers.
   - *Correction*: The mock store defends itself with a client-side WASM proof-of-work challenge and browser fingerprinting (canvas, WebGL, timing jitter). Static HTTP requests consistently failed with `403` or returned encrypted price payloads. We pivoted to a headless browser (Playwright) so the site's own compiled bundle handles the handshake natively.

2. **Honeypot Decoy Elements & Strike-through Prices**:
   - *AI Suggestion*: Generic CSS selectors like `.price, span:has-text("₹")` were recommended by AI assistants.
   - *Correction*: The mock store embeds hidden honeypot price nodes and displays crossed-out MRP tags. Blindly picking the first matching element extracted decoy prices or strike-through values. We wrote custom evaluation logic checking computed styles (`text-decoration-line !== 'line-through'`), visibility, and structural signatures.

3. **DOM Dynamic Reshuffling & Fragile Selectors**:
   - *AI Suggestion*: AI proposed deep structural XPath and positional selectors (`div:nth-child(2) > span:nth-child(3)`).
   - *Correction*: The store intentionally randomizes DOM nesting on reloads. Positional selectors broke across consecutive runs. We shifted to semantic text matching, regex boundary matching (`/₹\s*[\d,]+(?:\.\d+)?/`), and button-trigger coordination.

4. **In-Memory Scheduling vs. Ephemeral Cloud Hosts**:
   - *AI Suggestion*: AI suggested using `node-cron` or `setInterval` running inside Express for the 2-hour scrape schedule.
   - *Correction*: Free-tier cloud instances (like Render) sleep after 15 minutes of inactivity, terminating all in-process timers. We replaced in-memory timers with an external webhook (`POST /api/scrape/run`) triggered by cron-job.org with an `X-Cron-Secret` header, ensuring wake-up and execution without hosting costs.

5. **Environment Configuration & CORS Discrepancies**:
   - *AI Suggestion*: Initial AI scaffolding assumed Vite and Express ran in the same origin and mixed up environment variable conventions (`VITE_API_BASE_URL` vs `VITE_API_URL`).
   - *Correction*: When deploying frontend to Vercel and backend to Render, cross-origin requests were blocked. We configured explicit CORS options for Vercel origins, added fallback resolution in `src/api.js`, and documented all required variables in `.env.example`.


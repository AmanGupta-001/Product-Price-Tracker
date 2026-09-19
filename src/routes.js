// src/routes.js
const express = require('express');
const { supabase } = require('./db');
const { searchProducts } = require('./scraper/catalogClient');
const { runScrapeForAllActive, runScrapeForProduct } = require('./scraper/scrapeRunner');

const router = express.Router();

// ---------------------------------------------------------------
// Cron trigger. cron-job.org hits this on a schedule; free-tier Render
// sleeps between calls, which is why this is invoked externally rather
// than run as an always-on setInterval loop.
// Protected by a shared secret header so the endpoint can't be spammed
// by anyone who finds the URL.
// ---------------------------------------------------------------
router.post('/scrape/run', async (req, res) => {
  const secret = req.header('X-Cron-Secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Respond immediately; scraping (esp. with Playwright/retries) can
  // exceed typical cron-service HTTP timeouts. Run in the background
  // and let the dashboard reflect results once written.
  res.status(202).json({ status: 'accepted' });

  const force = req.query.force === 'true' || req.body?.force === true;

  try {
    const results = await runScrapeForAllActive({ force });
    console.log('[cron scrape run] complete:', JSON.stringify(results));
  } catch (err) {
    console.error('[cron scrape run] failed:', err);
  }
});

// In-memory store for live scrape results (keyed by productId, cleared after read).
// Avoids a DB round-trip just to communicate the scrape outcome back to the UI.
const scrapeResultCache = new Map();

// Manual trigger for one product — responds immediately with 202 so Render's
// 30 s HTTP timeout is never hit, then runs Playwright in the background.
// The frontend polls /products/:id/scrape/status for the outcome.
router.post('/products/:id/scrape', async (req, res) => {
  const { data: product, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !product) return res.status(404).json({ error: 'product not found' });

  // Clear any stale result for this product before starting a new run.
  scrapeResultCache.delete(req.params.id);

  // Fire and forget — run in background, store result for polling.
  runScrapeForProduct(product)
    .then((result) => {
      scrapeResultCache.set(req.params.id, { status: 'done', result, ts: Date.now() });
      console.log(`[manual scrape] product ${req.params.id} done:`, JSON.stringify(result));
    })
    .catch((err) => {
      scrapeResultCache.set(req.params.id, { status: 'error', error: err.message, ts: Date.now() });
      console.error(`[manual scrape] product ${req.params.id} error:`, err);
    });

  res.status(202).json({ status: 'accepted', productId: req.params.id });
});

// Poll this after triggering a manual scrape. Returns {status:'pending'} until done.
router.get('/products/:id/scrape/status', (req, res) => {
  const cached = scrapeResultCache.get(req.params.id);
  if (!cached) return res.json({ status: 'pending' });

  // Return the result and clear from cache (one-time read).
  scrapeResultCache.delete(req.params.id);
  res.json(cached);
});

// ---------------------------------------------------------------
// Product search (catalog) — search-as-you-pick, not persisted.
// ---------------------------------------------------------------
router.get('/products/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q.trim()) return res.json([]);
  try {
    const results = await searchProducts(q);
    res.json(results.slice(0, 25));
  } catch (err) {
    res.status(502).json({ error: 'catalog search failed', detail: err.message });
  }
});

// ---------------------------------------------------------------
// Track a product: persist it, scrape it once immediately so the
// dashboard has data right away instead of waiting for the next cron tick.
// ---------------------------------------------------------------
router.post('/products/track', async (req, res) => {
  const { id, slug, name, sku } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });

  const { data: product, error } = await supabase
    .from('tracked_products')
    .upsert(
      {
        store_product_id: String(id),
        name,
        product_url: `${process.env.STORE_BASE_URL}/product/${id}`,
      },
      { onConflict: 'store_product_id' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  runScrapeForProduct(product).catch((err) =>
    console.error(`[initial scrape] product ${product.id}:`, err)
  );

  res.status(201).json(product);
});

router.get('/products/tracked', async (_req, res) => {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*, latest_prices(price, currency, in_stock, stock_qty, scraped_at)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---------------------------------------------------------------
// Price history + scrape log for one tracked product.
// ---------------------------------------------------------------
router.get('/products/:id/history', async (req, res) => {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('product_id', req.params.id)
    .order('scraped_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/products/:id/logs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const { data, error } = await supabase
    .from('scrape_logs')
    .select('*')
    .eq('product_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;

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

// Manual trigger for one product (used by the "scrape now" button, if any,
// and handy for testing/demoing without waiting for the cron schedule).
router.post('/products/:id/scrape', async (req, res) => {
  const { data: product, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !product) return res.status(404).json({ error: 'product not found' });

  const result = await runScrapeForProduct(product);
  res.json(result);
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

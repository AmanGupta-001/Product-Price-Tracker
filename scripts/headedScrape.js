#!/usr/bin/env node
// scripts/headedScrape.js
//
// Runs the Playwright scraper in HEADED mode against a single product so
// you can watch (and record) the full challenge → reveal → price flow.
//
// Usage:
//   node scripts/headedScrape.js <store_product_id>
//
// Example:
//   node scripts/headedScrape.js 42
//
// Tip: use OBS Studio, Loom, or Windows Game Bar (Win+G) to record your screen
// while this script runs so you can submit the required 2–4 min screen recording.

require('dotenv').config();
const { scrapeProduct } = require('../src/scraper/productScraper');

const storeProductId = process.argv[2];

if (!storeProductId) {
  console.error('Usage: node scripts/headedScrape.js <store_product_id>');
  console.error('');
  console.error('The store_product_id is the numeric ID from the product URL on the mock store,');
  console.error('e.g. for https://demo.inelabteamdev.com/product/42 it is "42".');
  console.error('');
  console.error('You can also find IDs by searching on your app and noting the store_product_id');
  console.error('shown on the product page.');
  process.exit(1);
}

console.log(`\n[headed-scrape] Starting HEADED scrape for store product ID: ${storeProductId}`);
console.log('[headed-scrape] A browser window will open — start your screen recorder now!\n');

(async () => {
  const startedAt = Date.now();
  const result = await scrapeProduct(storeProductId, { headed: true });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\n─────────────────────────────────────────');
  console.log(`[headed-scrape] Completed in ${elapsed}s`);
  console.log('─────────────────────────────────────────');

  if (result.ok) {
    const { price, currency, inStock, stockQty, structureSignature } = result.data;
    console.log(`  Status   : ✅ SUCCESS`);
    console.log(`  Price    : ${currency} ${price}`);
    console.log(`  In Stock : ${inStock}`);
    console.log(`  Stock Qty: ${stockQty ?? 'unknown'}`);
    console.log(`  Signature: ${structureSignature}`);
  } else {
    console.log(`  Status   : ❌ FAILED (all attempts exhausted)`);
  }

  console.log('\n  Attempt log:');
  for (const a of result.attempts) {
    const icon = a.status === 'success' ? '✅' : a.status === 'retried' ? '🔄' : '❌';
    console.log(
      `    ${icon} Attempt ${a.attemptNumber} — ${a.status} — ${a.durationMs}ms` +
      (a.errorMessage ? ` — ${a.errorMessage}` : '')
    );
  }

  console.log('\n[headed-scrape] Done. You can stop your screen recording now.\n');
  process.exit(result.ok ? 0 : 1);
})();

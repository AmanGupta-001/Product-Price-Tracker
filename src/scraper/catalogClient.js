// src/scraper/catalogClient.js
//
// The catalog endpoint (/api/catalog?page=&pageSize=) is the stable part
// of the store: same shape every time, no price/stock on it. Used for
// product search/selection only. Price volatility lives in the
// per-product endpoint, handled separately in productClient.js.

const BASE_URL = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

/**
 * Fetch a single catalog page.
 */
async function fetchCatalogPage(page = 1, pageSize = 20) {
  const url = `${BASE_URL}/api/catalog?page=${page}&pageSize=${pageSize}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Catalog fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json(); // { page, pageSize, pages, total, items: [...] }
}

/**
 * Search the full catalog by partial/full product name (case-insensitive).
 * Paginates through /api/catalog until it has walked every page, since
 * the store doesn't expose a server-side search/filter param.
 *
 * For 1000 products at pageSize=100 that's 10 requests. Fine for an
 * on-demand search; do NOT call this from the scheduled scrape job —
 * scheduled scrapes should hit /api/product/:id directly using the
 * store_product_id already saved in tracked_products.
 */
async function searchProducts(query, { pageSize = 100 } = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const first = await fetchCatalogPage(1, pageSize);
  const results = first.items.filter((p) => p.name.toLowerCase().includes(q));

  const totalPages = first.pages ?? Math.ceil(first.total / pageSize);
  const remaining = [];
  for (let page = 2; page <= totalPages; page++) {
    remaining.push(fetchCatalogPage(page, pageSize));
  }
  const rest = await Promise.all(remaining);
  for (const batch of rest) {
    results.push(...batch.items.filter((p) => p.name.toLowerCase().includes(q)));
  }

  return results; // [{ id, slug, name, brand, category, sku, description }]
}

module.exports = { fetchCatalogPage, searchProducts, BASE_URL };

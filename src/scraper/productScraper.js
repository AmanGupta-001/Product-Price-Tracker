// src/scraper/productScraper.js
//
// WHY PLAYWRIGHT IS NOT OPTIONAL HERE:
// The product page's price is gated behind:
// 1. A human-interaction verification: mouse trajectory movements (minMoves: 8, spaced >40ms)
//    and a hover dwell period (minDwellMs: 600) on the price block before "Reveal price" activates.
// 2. A challenge -> session -> price handshake where challenge returns a WASM proof-of-work
//    blob, session requires a solved nonce + browser fingerprint (canvas, GL, screen, frame timings).
// 3. The price response itself is an encrypted payload ("e": "...") that only the site's own JS
//    decrypts into the DOM.
// 4. The site contains a hidden honeypot/decoy price (display: none, aria-hidden="true") to trap
//    naive scrapers that search raw text, while displaying the true price using dynamic formatting
//    (₹, Rs., unicode full-width digits, varying space/comma conventions).
//
// STRATEGY:
// - Load the page in Playwright, simulate realistic human mouse movement over the price block,
//   dwell for >700ms, and click "Reveal price".
// - Let the site's own bundle run the challenge handshake and decrypt the price into .price-success.
// - Filter out decoy/hidden elements and strikethrough (MRP) elements using computed styles.
// - Intermittent 500s and expired tokens are handled via full-reload retry with exponential backoff.

const { chromium } = require('playwright');

const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';
const PRODUCT_URL_TEMPLATE =
  process.env.PRODUCT_URL_TEMPLATE || `${STORE_BASE_URL}/product/{id}`;

const MAX_ATTEMPTS = 4;
const PRICE_WAIT_TIMEOUT_MS = 18_000;
const BACKOFF_BASE_MS = 1_500;

const STOCK_LEFT_REGEX = /only\s+(\d+)\s+left/i;
const IN_STOCK_REGEX = /\bin stock\b/i;
const OUT_OF_STOCK_REGEX = /\bout of stock\b/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalizes full-width unicode digits (０-９) to standard ASCII (0-9)
 */
function normalizeNumberString(str) {
  return str
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

/**
 * Parses numeric price from currency text, handling ₹, Rs., Rs, INR, European/Indian separators
 */
function parsePriceFromText(text) {
  if (!text) return null;
  const norm = normalizeNumberString(text);
  const match = norm.match(/(?:\u20B9|Rs\.?|INR)\s?([\d\s,.]+)/i);
  if (!match) return null;

  let numStr = match[1].trim();
  // Strip trailing '/-' (e.g. 1500/-)
  numStr = numStr.replace(/\/-.*$/, '');

  // Handle euro format (e.g. 12.345,00) vs standard format (12,345.00)
  if (/,\d{2}$/.test(numStr) && numStr.includes('.')) {
    numStr = numStr.replace(/\./g, '').replace(',', '.');
  } else {
    numStr = numStr.replace(/,/g, '').replace(/\s/g, '');
  }

  const val = parseFloat(numStr);
  return Number.isFinite(val) && val > 0 ? val : null;
}

/**
 * Extracts visible price candidates inside the product area. The page can show
 * MRP, deal labels, hidden decoys, and the current selling price together, so
 * the scraper keeps visual metadata and later chooses the dominant price.
 */
async function extractPrices(page) {
  return page.evaluate(() => {
    const PRICE_RE = /(?:\u20B9|Rs\.?|INR)/i;
    const PRICE_MATCH_RE = /(?:\u20B9|Rs\.?|INR)\s?[\d\s,.]+/gi;

    function cleanText(text) {
      return text.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
    }

    function isHiddenSelf(el) {
      if (!el) return true;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        s.display === 'none' ||
        s.visibility === 'hidden' ||
        el.getAttribute('aria-hidden') === 'true' ||
        s.opacity === '0' ||
        r.width === 0 ||
        r.height === 0
      );
    }

    function isHiddenDeep(el, stopAt) {
      for (let cur = el; cur && cur !== stopAt.parentElement; cur = cur.parentElement) {
        if (isHiddenSelf(cur)) return true;
      }
      return false;
    }

    function isStruckDeep(el, stopAt) {
      for (let cur = el; cur && cur !== stopAt.parentElement; cur = cur.parentElement) {
        const s = window.getComputedStyle(cur);
        const cls = String(cur.className || '').toLowerCase();
        if (
          s.textDecorationLine.includes('line-through') ||
          s.textDecoration.includes('line-through') ||
          cls.includes('mrp') ||
          cls.includes('original') ||
          cls.includes('strike')
        ) {
          return true;
        }
      }
      return false;
    }

    const priceMain =
      document.querySelector('.price-success') ||
      document.querySelector('.price-main') ||
      document.querySelector('.price-block') ||
      document.body;
    const allNodes = priceMain.querySelectorAll('*');
    const found = [];

    allNodes.forEach((node) => {
      if (isHiddenDeep(node, priceMain)) return;

      const text = cleanText(node.textContent?.trim() || '');
      if (!text || text.length > 80 || !PRICE_RE.test(text)) return;

      const priceMatches = text.match(PRICE_MATCH_RE) || [];
      if (priceMatches.length !== 1) return;

      const s = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const fontSize = parseFloat(s.fontSize) || 0;
      const fontWeight = parseInt(s.fontWeight, 10) || 400;
      const lower = text.toLowerCase();
      const labelPenalty =
        lower.includes('deal price') ||
        lower.includes('mrp') ||
        lower.includes('original') ||
        lower.includes('was')
          ? 200
          : 0;
      const score =
        fontSize * 10 +
        (fontWeight >= 600 ? 35 : 0) +
        Math.min(rect.width * rect.height, 5000) / 100 -
        labelPenalty;

      found.push({
        text,
        strikethrough: isStruckDeep(node, priceMain),
        tag: node.tagName,
        className: node.className || '',
        fontSize,
        fontWeight,
        score,
      });
    });

    return found;
  });
}

async function extractBodyText(page) {
  return page.evaluate(() => {
    const block = document.querySelector('.price-block');
    return (block ? block.innerText + '\n' : '') + document.body.innerText;
  });
}

function structureSignature(priceNodes) {
  const shape = priceNodes
    .map((n) => `${n.tag}.${n.className}`.trim())
    .sort()
    .join('|');
  let hash = 0;
  for (let i = 0; i < shape.length; i++) {
    hash = (hash * 31 + shape.charCodeAt(i)) | 0;
  }
  return `sig_${hash}`;
}

/**
 * Scrapes a single product through a full page load and challenge flow.
 */
async function attemptScrape(browser, storeProductId) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const networkEvents = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/challenge') || url.includes('/api/session') || url.includes('/price')) {
      networkEvents.push({ url, status: res.status(), ts: Date.now() });
    }
  });

  try {
    const url = PRODUCT_URL_TEMPLATE.replace('{id}', storeProductId);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PRICE_WAIT_TIMEOUT_MS });

    // 1. Locate the price block
    const priceBlock = page.locator('.price-block');
    await priceBlock.waitFor({ state: 'visible', timeout: PRICE_WAIT_TIMEOUT_MS });

    // 2. If the price is hidden behind the interaction gate, satisfy human trajectory
    const revealBtn = page.locator('button:has-text("Reveal price")');
    if (await revealBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const box = await priceBlock.boundingBox();
      if (box) {
        // Move mouse in realistic trajectory (>8 moves, spaced >50ms)
        for (let i = 0; i < 15; i++) {
          const x = box.x + 25 + i * 15;
          const y = box.y + 20 + (i % 2 === 0 ? 6 : -6);
          await page.mouse.move(x, y);
          await page.waitForTimeout(55);
        }
        // Dwell for >600ms
        await page.waitForTimeout(750);
      }

      // Wait until Reveal price button is enabled
      await page.waitForFunction(() => {
        const btn = document.querySelector('button[aria-label="Reveal price"]');
        return btn && !btn.disabled;
      }, { timeout: 6000 }).catch(() => {});

      await revealBtn.click({ timeout: 5000 });
    }

    // 3. Wait for price-success or rendered price
    await page.waitForSelector('.price-success', { timeout: PRICE_WAIT_TIMEOUT_MS });

    const serverError = networkEvents.find((e) => e.status >= 500);
    if (serverError) {
      throw new Error(`Upstream ${serverError.status} on ${serverError.url}`);
    }

    const priceNodes = await extractPrices(page);
    const bodyText = await extractBodyText(page);

    // Prefer the visually dominant non-struck price, not the lowest number:
    // sale/deal labels and MRP can both be present beside the main price.
    const priceCandidates = [];
    for (const node of priceNodes) {
      if (node.strikethrough) continue;
      const parsed = parsePriceFromText(node.text);
      if (parsed) {
        priceCandidates.push({ price: parsed, score: node.score ?? 0 });
      }
    }

    // If leaf elements didn't yield a price, fallback to regex search on price-block text
    if (priceCandidates.length === 0) {
      const matches = bodyText.match(/(?:\u20B9|Rs\.?|INR)\s?[\d\s,.]+/gi);
      if (matches) {
        for (const m of matches) {
          const p = parsePriceFromText(m);
          if (p) priceCandidates.push({ price: p, score: 0 });
        }
      }
    }

    if (priceCandidates.length === 0) {
      throw new Error('No valid price found on page');
    }

    priceCandidates.sort((a, b) => b.score - a.score);
    const price = priceCandidates[0].price;

    // Stock detection
    let inStock = null;
    let stockQty = null;
    const leftMatch = bodyText.match(STOCK_LEFT_REGEX);
    if (leftMatch) {
      inStock = true;
      stockQty = parseInt(leftMatch[1], 10);
    } else if (OUT_OF_STOCK_REGEX.test(bodyText)) {
      inStock = false;
      stockQty = 0;
    } else if (IN_STOCK_REGEX.test(bodyText)) {
      inStock = true;
    } else {
      // Default to true if price is rendered without explicit out-of-stock flag
      inStock = true;
    }

    return {
      price,
      currency: 'INR',
      inStock,
      stockQty,
      structureSignature: structureSignature(priceNodes),
      networkEvents,
    };
  } finally {
    await context.close();
  }
}

/**
 * Public entry point: scrape one product with retry-by-reload and exponential backoff.
 */
async function scrapeProduct(storeProductId, { headed = false } = {}) {
  const browser = await chromium.launch({ headless: !headed });
  const attempts = [];

  try {
    for (let attemptNumber = 1; attemptNumber <= MAX_ATTEMPTS; attemptNumber++) {
      const startedAt = Date.now();
      try {
        const result = await attemptScrape(browser, storeProductId);
        attempts.push({
          attemptNumber,
          status: 'success',
          durationMs: Date.now() - startedAt,
          errorMessage: null,
          networkEvents: result.networkEvents,
        });
        return { ok: true, data: result, attempts };
      } catch (err) {
        const willRetry = attemptNumber < MAX_ATTEMPTS;
        attempts.push({
          attemptNumber,
          status: willRetry ? 'retried' : 'failed',
          durationMs: Date.now() - startedAt,
          errorMessage: err.message,
          networkEvents: [],
        });
        if (willRetry) {
          await sleep(BACKOFF_BASE_MS * 2 ** (attemptNumber - 1));
        }
      }
    }
    return { ok: false, data: null, attempts };
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeProduct };

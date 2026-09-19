// src/alerts.js
//
// Sends price-drop and back-in-stock email alerts via SendGrid.
// Requires env vars: SENDGRID_API_KEY, ALERT_EMAIL, FROM_EMAIL
//
// Alert conditions:
//   - Price dropped by >= ALERT_THRESHOLD_PCT (default 1% — alerts on any real drop)
//   - Item came back in stock (was out of stock, now in stock)
//
// Guards against spam: each product+event combo only fires if the
// previous alert for that product was sent > ALERT_COOLDOWN_HOURS ago.

const sgMail = require('@sendgrid/mail');

const ALERT_THRESHOLD_PCT = parseFloat(process.env.ALERT_THRESHOLD_PCT ?? '1');
const ALERT_COOLDOWN_HOURS = parseFloat(process.env.ALERT_COOLDOWN_HOURS ?? '6');

// In-memory cooldown map: productId -> { priceDrop: Date, backInStock: Date }
// Resets on server restart (acceptable for free tier that sleeps anyway).
const lastAlertSent = new Map();

function isReady() {
  return !!(process.env.SENDGRID_API_KEY && process.env.ALERT_EMAIL);
}

function canAlert(productId, type) {
  const cooldown = lastAlertSent.get(productId)?.[type];
  if (!cooldown) return true;
  const hoursElapsed = (Date.now() - cooldown.getTime()) / (1000 * 60 * 60);
  return hoursElapsed >= ALERT_COOLDOWN_HOURS;
}

function markAlerted(productId, type) {
  const existing = lastAlertSent.get(productId) ?? {};
  lastAlertSent.set(productId, { ...existing, [type]: new Date() });
}

function formatINR(price) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(price);
}

function emailHtml({ title, preheader, body, ctaUrl, ctaLabel }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #222;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:28px 32px;">
              <p style="margin:0;font-size:13px;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;">INE Price Tracker</p>
              <h1 style="margin:8px 0 0;font-size:22px;color:#f9fafb;font-weight:600;">${title}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
              ${ctaUrl ? `
              <div style="margin-top:28px;text-align:center;">
                <a href="${ctaUrl}"
                   style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;
                          padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
                  ${ctaLabel || 'View Product'}
                </a>
              </div>` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #222;padding:20px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#4b5563;">
                You're receiving this because you're tracking prices with INE Price Tracker.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a price-drop alert email.
 * @param {object} params
 * @param {object} params.product  - tracked_products row
 * @param {number} params.oldPrice - previous price
 * @param {number} params.newPrice - new lower price
 * @param {string} params.currency
 */
async function sendPriceDropAlert({ product, oldPrice, newPrice, currency = 'INR' }) {
  if (!isReady()) return;
  if (!canAlert(product.id, 'priceDrop')) {
    console.log(`[alerts] priceDrop cooldown active for product ${product.id}`);
    return;
  }

  const pctDrop = (((oldPrice - newPrice) / oldPrice) * 100).toFixed(1);
  const saving  = formatINR(oldPrice - newPrice);
  const ctaUrl  = product.product_url || process.env.FRONTEND_URL || '';

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const body = `
    <p style="color:#9ca3af;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Good news — the price of <strong style="color:#f9fafb;">${product.name}</strong>
      just dropped.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;margin-bottom:8px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Was</p>
          <p style="margin:0;font-size:20px;color:#9ca3af;text-decoration:line-through;">${formatINR(oldPrice)}</p>
        </td>
        <td style="padding:20px 24px;border-left:1px solid #2a2a2a;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Now</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#34d399;">${formatINR(newPrice)}</p>
        </td>
        <td style="padding:20px 24px;border-left:1px solid #2a2a2a;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">You Save</p>
          <p style="margin:0;font-size:20px;font-weight:600;color:#f59e0b;">${saving} (${pctDrop}%)</p>
        </td>
      </tr>
    </table>`;

  const msg = {
    to:      process.env.ALERT_EMAIL,
    from:    process.env.FROM_EMAIL || process.env.ALERT_EMAIL,
    subject: `📉 Price Drop: ${product.name} — Save ${pctDrop}% (${saving})`,
    html:    emailHtml({
      title:    `Price dropped ${pctDrop}%`,
      preheader: `${product.name} is now ${formatINR(newPrice)} — save ${saving}`,
      body,
      ctaUrl,
      ctaLabel: 'View Price History',
    }),
  };

  try {
    await sgMail.send(msg);
    markAlerted(product.id, 'priceDrop');
    console.log(`[alerts] priceDrop email sent for product ${product.id} (${pctDrop}% drop)`);
  } catch (err) {
    console.error('[alerts] sendPriceDropAlert failed:', err.response?.body ?? err.message);
  }
}

/**
 * Send a back-in-stock alert email.
 * @param {object} params
 * @param {object} params.product  - tracked_products row
 * @param {number} params.price    - current price
 * @param {string} params.currency
 */
async function sendBackInStockAlert({ product, price, currency = 'INR' }) {
  if (!isReady()) return;
  if (!canAlert(product.id, 'backInStock')) {
    console.log(`[alerts] backInStock cooldown active for product ${product.id}`);
    return;
  }

  const ctaUrl = product.product_url || process.env.FRONTEND_URL || '';

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const body = `
    <p style="color:#9ca3af;font-size:15px;line-height:1.6;margin:0 0 20px;">
      <strong style="color:#f9fafb;">${product.name}</strong> is back in stock!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;margin-bottom:8px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Current Price</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#34d399;">${formatINR(price)}</p>
        </td>
        <td style="padding:20px 24px;border-left:1px solid #2a2a2a;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Status</p>
          <p style="margin:0;font-size:18px;font-weight:600;color:#34d399;">● In Stock</p>
        </td>
      </tr>
    </table>`;

  const msg = {
    to:      process.env.ALERT_EMAIL,
    from:    process.env.FROM_EMAIL || process.env.ALERT_EMAIL,
    subject: `🟢 Back in Stock: ${product.name} — ${formatINR(price)}`,
    html:    emailHtml({
      title:    'Back in Stock!',
      preheader: `${product.name} is available again at ${formatINR(price)}`,
      body,
      ctaUrl,
      ctaLabel: 'View Product',
    }),
  };

  try {
    await sgMail.send(msg);
    markAlerted(product.id, 'backInStock');
    console.log(`[alerts] backInStock email sent for product ${product.id}`);
  } catch (err) {
    console.error('[alerts] sendBackInStockAlert failed:', err.response?.body ?? err.message);
  }
}

module.exports = { sendPriceDropAlert, sendBackInStockAlert, isReady, ALERT_THRESHOLD_PCT };

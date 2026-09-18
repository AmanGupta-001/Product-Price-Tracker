// src/pages/ProductPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import api from '../api';
import StockBadge from '../components/StockBadge';
import PriceChart from '../components/PriceChart';
import ScrapeLog from '../components/ScrapeLog';
import './ProductPage.css';

function formatPrice(price, currency = 'INR') {
  if (price == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(price);
}

export default function ProductPage() {
  const { id } = useParams();
  const [product, setProduct]   = useState(null);
  const [history, setHistory]   = useState([]);
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [scraping, setScraping] = useState(false);
  const [activeTab, setActiveTab] = useState('chart'); // 'chart' | 'logs'

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [trackedRes, historyRes, logsRes] = await Promise.all([
        api.get('/products/tracked'),
        api.get(`/products/${id}/history`),
        api.get(`/products/${id}/logs`),
      ]);
      const found = trackedRes.data.find((p) => p.id === id);
      setProduct(found ?? null);
      setHistory(historyRes.data);
      setLogs(logsRes.data);
    } catch (err) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleManualScrape = async () => {
    setScraping(true);
    try {
      await api.post(`/products/${id}/scrape`);
      await load();
    } catch (err) {
      console.error('Manual scrape failed:', err);
    } finally {
      setScraping(false);
    }
  };

  if (loading) return (
    <div className="page container">
      <div className="skeleton mb-4" style={{ height: 32, width: 200 }} />
      <div className="skeleton mb-6" style={{ height: 100 }} />
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );

  if (error) return (
    <div className="page container">
      <div className="empty-state">
        <div className="icon">💥</div>
        <h3>Error loading product</h3>
        <p>{error}</p>
        <button className="btn btn-secondary mt-4" onClick={load}>Retry</button>
      </div>
    </div>
  );

  if (!product) return (
    <div className="page container">
      <div className="empty-state">
        <div className="icon">🕵️</div>
        <h3>Product not found</h3>
        <p>It may have been removed from tracking.</p>
        <Link to="/" className="btn btn-primary mt-4">Back to Dashboard</Link>
      </div>
    </div>
  );

  const latest = product.latest_prices?.[0] ?? null;
  const prevPrice = history.length >= 2 ? Number(history[history.length - 2].price) : null;
  const curPrice  = latest?.price != null ? Number(latest.price) : null;
  const priceDelta = (curPrice != null && prevPrice != null) ? curPrice - prevPrice : null;

  return (
    <div className="page hero-gradient">
      <div className="container">

        {/* Breadcrumb */}
        <div className="breadcrumb fade-in">
          <Link to="/" className="text-muted text-sm">Dashboard</Link>
          <span className="text-muted">›</span>
          <span className="text-sm">{product.name}</span>
        </div>

        {/* Product header */}
        <div className="pp-header card fade-in">
          <div className="pp-header-left">
            <div className="pp-title-row">
              <h1 className="pp-name">{product.name}</h1>
              <StockBadge inStock={latest?.in_stock ?? null} stockQty={latest?.stock_qty ?? null} />
            </div>
            {product.store_product_id && (
              <p className="text-xs text-muted mono mt-1">Store ID: #{product.store_product_id}</p>
            )}
            {product.product_url && (
              <a href={product.product_url} target="_blank" rel="noopener noreferrer"
                className="pp-store-link text-xs mt-2">
                View on Store ↗
              </a>
            )}
          </div>

          <div className="pp-price-block">
            <span className="pp-price gradient-text">
              {curPrice != null ? formatPrice(curPrice, latest?.currency) : 'No data yet'}
            </span>
            {priceDelta !== null && (
              <span className={`price-delta ${priceDelta > 0 ? 'up' : priceDelta < 0 ? 'down' : 'flat'}`}>
                {priceDelta > 0 ? '▲' : priceDelta < 0 ? '▼' : '—'}{' '}
                {priceDelta !== 0
                  ? `${formatPrice(Math.abs(priceDelta), latest?.currency)} vs prev`
                  : 'No change'}
              </span>
            )}
            {latest?.scraped_at && (
              <p className="text-xs text-muted mt-1">
                Updated {formatDistanceToNow(new Date(latest.scraped_at), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="pp-actions fade-in">
          <button
            id="manual-scrape-btn"
            className="btn btn-secondary"
            onClick={handleManualScrape}
            disabled={scraping}
          >
            {scraping ? <><span className="spinner" /> Scraping…</> : '⟳ Scrape Now'}
          </button>
          <p className="text-xs text-muted">
            Scheduled scrapes run automatically via cron-job.org.
          </p>
        </div>

        {/* Tabs */}
        <div className="pp-tabs fade-in">
          <button
            id="tab-chart"
            className={`tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
            onClick={() => setActiveTab('chart')}
          >
            📊 Price History
            <span className="tab-count">{history.length}</span>
          </button>
          <button
            id="tab-logs"
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            🪵 Scrape Logs
            <span className="tab-count">{logs.length}</span>
          </button>
        </div>

        {/* Tab content */}
        <div className="pp-tab-content">
          {activeTab === 'chart' && (
            <div className="card fade-in">
              <PriceChart history={history} />
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="fade-in">
              <ScrapeLog logs={logs} />
            </div>
          )}
        </div>

        {/* History table (compact, below chart) */}
        {activeTab === 'chart' && history.length > 0 && (
          <div className="mt-6 fade-in">
            <p className="section-title mb-4">Raw Readings</p>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().slice(0, 50).map((h) => (
                    <tr key={h.id}>
                      <td className="mono text-xs">
                        {format(new Date(h.scraped_at), 'dd MMM yyyy, HH:mm:ss')}
                      </td>
                      <td className="font-bold">
                        {formatPrice(h.price, h.currency)}
                      </td>
                      <td>
                        <StockBadge inStock={h.in_stock} stockQty={h.stock_qty} />
                      </td>
                      <td className="text-muted">{h.stock_qty ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

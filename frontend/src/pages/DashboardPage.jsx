import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import ProductCard from '../components/ProductCard';
import { LayersIcon } from '../components/Icons';
import './DashboardPage.css';

export default function DashboardPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/products/tracked');
      setProducts(data);
    } catch (err) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60 s so the dashboard stays live
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="page hero-gradient">
      <div className="container">
        {/* Hero header */}
        <div className="dash-hero fade-in">
          <div>
            <h1 className="dash-title">Tracked Products</h1>
            <p className="text-muted mt-2">
              Continuous price & stock monitoring. Auto-refreshes every 60s.
            </p>
          </div>
          <Link to="/search" className="btn btn-primary">
            + Track Product
          </Link>
        </div>

        {/* Stats bar */}
        {!loading && products.length > 0 && (
          <div className="dash-stats fade-in">
            <div className="dash-stat">
              <span className="ds-number">{products.length}</span>
              <span className="ds-label">
                <span className="ds-dot" style={{ background: 'var(--accent-blue)' }} />
                Total Tracked
              </span>
            </div>
            <div className="dash-stat">
              <span className="ds-number" style={{ color: 'var(--accent-emerald)' }}>
                {products.filter((p) => p.latest_prices?.[0]?.in_stock).length}
              </span>
              <span className="ds-label">
                <span className="ds-dot" style={{ background: 'var(--accent-emerald)' }} />
                In Stock
              </span>
            </div>
            <div className="dash-stat">
              <span className="ds-number" style={{ color: 'var(--accent-rose)' }}>
                {products.filter((p) => p.latest_prices?.[0]?.in_stock === false).length}
              </span>
              <span className="ds-label">
                <span className="ds-dot" style={{ background: 'var(--accent-rose)' }} />
                Out of Stock
              </span>
            </div>
            <div className="dash-stat">
              <span className="ds-number" style={{ color: 'var(--accent-amber)' }}>
                {products.filter((p) => !p.latest_prices?.[0]).length}
              </span>
              <span className="ds-label">
                <span className="ds-dot" style={{ background: 'var(--accent-amber)' }} />
                Pending
              </span>
            </div>
          </div>
        )}

        <div className="divider" />

        {/* Body */}
        {loading && (
          <div className="product-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card skeleton" style={{ height: 170 }} />
            ))}
          </div>
        )}

        {error && (
          <div className="error-banner fade-in">
            <span>{error}</span>
            <button className="btn btn-sm btn-secondary" onClick={load}>Retry</button>
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">
              <LayersIcon size={40} />
            </div>
            <h3>No products tracked yet</h3>
            <p className="mt-2 text-muted">
              Search for any catalog product to start tracking historical prices.
            </p>
            <Link to="/search" className="btn btn-primary mt-4">Search Catalog</Link>
          </div>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// src/pages/SearchPage.jsx
import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { SearchIcon, CheckIcon } from '../components/Icons';
import './SearchPage.css';

export default function SearchPage() {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tracking, setTracking] = useState({}); // productId → 'pending' | 'done' | 'error'
  const debounceRef = useRef(null);
  const navigate    = useNavigate();

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/products/search', { params: { q } });
      setResults(data);
    } catch (err) {
      setError(err.response?.data?.error ?? err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  const handleTrack = async (product) => {
    setTracking((t) => ({ ...t, [product.id]: 'pending' }));
    try {
      const { data } = await api.post('/products/track', {
        id:   product.id,
        slug: product.slug,
        name: product.name,
        sku:  product.sku,
      });
      setTracking((t) => ({ ...t, [product.id]: 'done' }));
      setTimeout(() => navigate(`/product/${data.id}`), 800);
    } catch (err) {
      setTracking((t) => ({ ...t, [product.id]: 'error' }));
      console.error('Track failed:', err);
    }
  };

  return (
    <div className="page hero-gradient">
      <div className="container">
        <div className="search-hero fade-in">
          <h1>Catalog Search</h1>
          <p className="text-muted mt-2">
            Search products by name or SKU, then click <strong>Track</strong> to record prices.
          </p>
        </div>

        {/* Search input */}
        <div className="search-bar-wrap fade-in">
          <span className="search-icon-box">
            <SearchIcon size={18} />
          </span>
          <input
            id="product-search-input"
            type="text"
            className="input search-input"
            placeholder="Search catalog (e.g. iPhone 15, Wireless Headphones, Watch)…"
            value={query}
            onChange={handleInput}
            autoFocus
          />
          {loading && <span className="spinner" />}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="search-suggestions fade-in">
          <span className="text-xs text-muted">Popular searches:</span>
          {['iPhone', 'Wireless', 'Headphones', 'Watch', 'Shoes', 'Speaker'].map((term) => (
            <button
              key={term}
              type="button"
              className="suggestion-chip"
              onClick={() => {
                setQuery(term);
                search(term);
              }}
            >
              {term}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="search-error fade-in">{error}</div>
        )}

        {/* Empty query hint */}
        {!query.trim() && !loading && (
          <div className="search-hint fade-in">
            <p className="text-muted text-sm">Type a search query or pick a suggestion above.</p>
          </div>
        )}

        {/* No results */}
        {query.trim() && !loading && results.length === 0 && !error && (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">
              <SearchIcon size={32} />
            </div>
            <h3>No products found</h3>
            <p className="text-muted">Try a different search term or category keyword.</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="search-results-list fade-in">
            <p className="results-count text-xs text-muted mb-4">
              {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
            </p>
            {results.map((p) => {
              const state = tracking[p.id];
              return (
                <div key={p.id} className="search-result-item card">
                  <div className="sri-info">
                    <div className="sri-name">{p.name}</div>
                    <div className="sri-meta">
                      {p.brand && <span className="badge badge-muted">{p.brand}</span>}
                      {p.category && <span className="badge badge-muted">{p.category}</span>}
                      {p.sku && <span className="text-xs text-muted mono">SKU: {p.sku}</span>}
                    </div>
                    {p.description && (
                      <p className="sri-desc text-xs text-muted mt-1">{p.description}</p>
                    )}
                  </div>

                  <div className="sri-action">
                    {state === 'done' ? (
                      <span className="badge badge-green">
                        <CheckIcon size={12} /> Tracked
                      </span>
                    ) : state === 'error' ? (
                      <button className="btn btn-danger btn-sm" onClick={() => handleTrack(p)}>
                        Retry
                      </button>
                    ) : state === 'pending' ? (
                      <button className="btn btn-primary btn-sm" disabled>
                        <span className="spinner" />
                        Tracking…
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => handleTrack(p)}>
                        Track
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

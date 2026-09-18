// src/components/ProductCard.jsx
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import StockBadge from './StockBadge';
import './ProductCard.css';

function formatPrice(price, currency = 'INR') {
  if (price == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(price);
}

export default function ProductCard({ product }) {
  const latest = product.latest_prices?.[0] ?? null;
  const scrapedAgo = latest?.scraped_at
    ? formatDistanceToNow(new Date(latest.scraped_at), { addSuffix: true })
    : null;

  return (
    <Link to={`/product/${product.id}`} className="product-card card fade-in">
      <div className="pc-header">
        <div className="pc-name-wrap">
          <h3 className="pc-name">{product.name}</h3>
          {product.store_product_id && (
            <span className="pc-sku mono text-xs text-muted">#{product.store_product_id}</span>
          )}
        </div>
        <StockBadge
          inStock={latest?.in_stock ?? null}
          stockQty={latest?.stock_qty ?? null}
        />
      </div>

      <div className="pc-price">
        {latest?.price != null ? (
          <>
            <span className="pc-price-value gradient-text">
              {formatPrice(latest.price, latest.currency)}
            </span>
          </>
        ) : (
          <span className="pc-price-empty text-muted text-sm">No data yet</span>
        )}
      </div>

      <div className="pc-footer">
        <span className="text-xs text-muted">
          {scrapedAgo ? `Updated ${scrapedAgo}` : 'Never scraped'}
        </span>
        <span className="pc-view-link text-xs">View details →</span>
      </div>
    </Link>
  );
}

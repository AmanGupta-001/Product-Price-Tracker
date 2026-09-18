// src/components/StockBadge.jsx
export default function StockBadge({ inStock, stockQty }) {
  if (inStock === null || inStock === undefined) {
    return <span className="badge badge-muted">Unknown</span>;
  }
  if (!inStock) {
    return (
      <span className="badge badge-red">
        <span className="pulse-dot red" />
        Out of Stock
      </span>
    );
  }
  if (stockQty != null && stockQty <= 5) {
    return (
      <span className="badge badge-yellow">
        <span className="pulse-dot yellow" />
        Only {stockQty} left
      </span>
    );
  }
  return (
    <span className="badge badge-green">
      <span className="pulse-dot green" />
      {stockQty != null ? `In Stock (${stockQty})` : 'In Stock'}
    </span>
  );
}

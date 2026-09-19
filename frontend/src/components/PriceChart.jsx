// src/components/PriceChart.jsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { ChartIcon } from './Icons';
import './PriceChart.css';

function formatPrice(v) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip glass">
      <p className="tooltip-date">{format(new Date(label), 'dd MMM yyyy, HH:mm')}</p>
      <p className="tooltip-price">{formatPrice(d.price)}</p>
      <p className="tooltip-stock">
        {d.in_stock
          ? d.stock_qty != null ? `In Stock (${d.stock_qty} left)` : 'In Stock'
          : 'Out of Stock'}
      </p>
    </div>
  );
};

export default function PriceChart({ history }) {
  if (!history?.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <ChartIcon size={32} />
        </div>
        <h3>No price history yet</h3>
        <p className="text-muted">Trigger a manual scrape or wait for the next scheduled run.</p>
      </div>
    );
  }

  const data = history.map((h) => ({
    ...h,
    ts: h.scraped_at,
    price: Number(h.price),
  }));

  const prices = data.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  return (
    <div className="price-chart-wrapper fade-in">
      {/* Stats row */}
      <div className="chart-stats">
        <div className="chart-stat">
          <span className="stat-label">Min</span>
          <span className="stat-value" style={{ color: 'var(--accent-emerald)' }}>
            {formatPrice(minPrice)}
          </span>
        </div>
        <div className="chart-stat">
          <span className="stat-label">Avg</span>
          <span className="stat-value" style={{ color: 'var(--accent-blue)' }}>
            {formatPrice(avgPrice)}
          </span>
        </div>
        <div className="chart-stat">
          <span className="stat-label">Max</span>
          <span className="stat-value" style={{ color: 'var(--accent-amber)' }}>
            {formatPrice(maxPrice)}
          </span>
        </div>
        <div className="chart-stat">
          <span className="stat-label">Data Points</span>
          <span className="stat-value">{data.length}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-area">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="ts"
              tickFormatter={(v) => format(new Date(v), 'dd MMM')}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={avgPrice}
              stroke="rgba(96,165,250,0.3)"
              strokeDasharray="4 4"
              label={{ value: 'Avg', position: 'right', fill: '#60a5fa', fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="url(#priceGradient)"
              strokeWidth={2.5}
              dot={(props) => {
                const { cx, cy, payload } = props;
                const color = payload.in_stock ? '#34d399' : '#fb7185';
                return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={color} stroke="var(--bg-base)" strokeWidth={2} />;
              }}
              activeDot={{ r: 6, fill: '#60a5fa', stroke: 'var(--bg-base)', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="chart-legend text-xs text-muted">
        <span style={{ color: 'var(--accent-emerald)' }}>●</span> In Stock &nbsp;
        <span style={{ color: 'var(--accent-rose)' }}>●</span> Out of Stock &nbsp;
        — Dots show stock status at each reading
      </p>
    </div>
  );
}

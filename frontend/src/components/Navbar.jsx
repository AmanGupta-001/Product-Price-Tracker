import { Link, NavLink } from 'react-router-dom';
import { TrendIcon } from './Icons';
import './Navbar.css';

export default function Navbar() {
  return (
    <header className="navbar glass">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon-box">
            <TrendIcon size={16} />
          </span>
          <div className="brand-text">
            <span className="brand-title">PriceTracker</span>
            <span className="brand-badge">INE LAB</span>
          </div>
        </Link>

        <nav className="navbar-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            + Track Product
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

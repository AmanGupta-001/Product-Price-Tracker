// src/components/Navbar.jsx
import { Link, NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  return (
    <nav className="navbar glass">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">📈</span>
          <span className="brand-name">
            <span className="gradient-text">PriceTracker</span>
            <span className="brand-by">by INE</span>
          </span>
        </Link>

        <div className="navbar-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            + Track Product
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

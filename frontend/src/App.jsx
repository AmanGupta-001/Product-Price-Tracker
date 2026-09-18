// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import DashboardPage from './pages/DashboardPage';
import SearchPage    from './pages/SearchPage';
import ProductPage   from './pages/ProductPage';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"            element={<DashboardPage />} />
        <Route path="/search"      element={<SearchPage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="*"            element={
          <div className="page container">
            <div className="empty-state fade-in">
              <div className="icon">🌌</div>
              <h3>Page not found</h3>
              <p>The URL you visited doesn't exist.</p>
              <a href="/" className="btn btn-primary mt-4">Go Home</a>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, logout, isAuthenticated, hasRole } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      navigate('/');
    }
    setDropdownOpen(false);
  };

  if (!isAuthenticated) {
    return null; // Don't show navbar on public pages
  }

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-brand">
          <Link to="/dashboard">
            <h2>Site Template</h2>
          </Link>
        </div>

        <div className="navbar-menu">
          <Link to="/dashboard" className="nav-link">
            Dashboard
          </Link>
          
          {hasRole('admin') && (
            <Link to="/admin" className="nav-link">
              Admin
            </Link>
          )}
          
          <Link to="/analytics" className="nav-link">
            Analytics
          </Link>
          
          <Link to="/settings" className="nav-link">
            Settings
          </Link>
        </div>

        <div className="navbar-user">
          <div className="user-menu">
            <button 
              className="user-button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <div className="user-avatar">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} />
                ) : (
                  <div className="avatar-placeholder">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <span className="user-name">{user?.name || 'User'}</span>
              <span className="dropdown-arrow">▼</span>
            </button>

            {dropdownOpen && (
              <div className="user-dropdown">
                <div className="dropdown-header">
                  <div className="user-info">
                    <strong>{user?.name}</strong>
                    <small>{user?.email}</small>
                    <span className="user-role">{user?.role}</span>
                  </div>
                </div>
                
                <div className="dropdown-divider"></div>
                
                <Link 
                  to="/profile" 
                  className="dropdown-item"
                  onClick={() => setDropdownOpen(false)}
                >
                  👤 Profile
                </Link>
                
                <Link 
                  to="/settings" 
                  className="dropdown-item"
                  onClick={() => setDropdownOpen(false)}
                >
                  ⚙️ Settings
                </Link>
                
                <Link 
                  to="/billing" 
                  className="dropdown-item"
                  onClick={() => setDropdownOpen(false)}
                >
                  💳 Billing
                </Link>
                
                {hasRole('admin') && (
                  <>
                    <div className="dropdown-divider"></div>
                    <Link 
                      to="/admin" 
                      className="dropdown-item"
                      onClick={() => setDropdownOpen(false)}
                    >
                      🔧 Admin Panel
                    </Link>
                  </>
                )}
                
                <div className="dropdown-divider"></div>
                
                <button 
                  className="dropdown-item logout-button"
                  onClick={handleLogout}
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {dropdownOpen && (
        <div 
          className="dropdown-backdrop"
          onClick={() => setDropdownOpen(false)}
        ></div>
      )}
    </nav>
  );
};

export default Navbar;
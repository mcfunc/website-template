import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Simulate authentication - will be replaced with real Auth0 integration
      if (email && password) {
        // Mock successful login
        const mockUser = {
          id: '1',
          name: 'Demo User',
          email: email,
          role: 'user',
          avatar: null
        };
        
        onLogin(mockUser);
        navigate('/dashboard');
      } else {
        setError('Please enter both email and password');
      }
    } catch (err) {
      setError('Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSSOLogin = (provider) => {
    setLoading(true);
    // This will be replaced with Auth0 integration
    console.log(`Initiating ${provider} login`);
    
    // Mock SSO success
    setTimeout(() => {
      const mockUser = {
        id: '1',
        name: 'SSO User',
        email: `user@${provider}.com`,
        role: 'user',
        provider: provider
      };
      
      onLogin(mockUser);
      navigate('/dashboard');
    }, 1000);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <Link to="/" className="back-link">
            ← Back to Home
          </Link>
          <h1>Sign In</h1>
          <p>Welcome back! Please sign in to your account.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <div className="form-options">
            <label className="checkbox-label">
              <input type="checkbox" />
              <span>Remember me</span>
            </label>
            <Link to="/forgot-password" className="forgot-link">
              Forgot password?
            </Link>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="divider">
          <span>or continue with</span>
        </div>

        <div className="sso-options">
          <button 
            className="btn btn-sso google"
            onClick={() => handleSSOLogin('google')}
            disabled={loading}
          >
            <span className="sso-icon">🔍</span>
            Google
          </button>
          <button 
            className="btn btn-sso microsoft"
            onClick={() => handleSSOLogin('microsoft')}
            disabled={loading}
          >
            <span className="sso-icon">🪟</span>
            Microsoft
          </button>
          <button 
            className="btn btn-sso github"
            onClick={() => handleSSOLogin('github')}
            disabled={loading}
          >
            <span className="sso-icon">🐙</span>
            GitHub
          </button>
        </div>

        <div className="signup-prompt">
          Don't have an account? 
          <Link to="/register"> Sign up here</Link>
        </div>

        <div className="auth-features">
          <h3>Why sign in?</h3>
          <ul>
            <li>🔐 Secure data encryption</li>
            <li>📊 Personalized dashboards</li>
            <li>🔄 Real-time synchronization</li>
            <li>👥 Team collaboration tools</li>
            <li>📈 Advanced analytics</li>
          </ul>
        </div>
      </div>

      <div className="login-visual">
        <div className="visual-content">
          <h2>Welcome to the Future</h2>
          <p>
            Experience the next generation of web applications with our 
            comprehensive template featuring authentication, real-time data, 
            and modern architecture.
          </p>
          <div className="feature-highlights">
            <div className="highlight">
              <div className="highlight-icon">⚡</div>
              <span>Lightning Fast</span>
            </div>
            <div className="highlight">
              <div className="highlight-icon">🔒</div>
              <span>Enterprise Security</span>
            </div>
            <div className="highlight">
              <div className="highlight-icon">🌐</div>
              <span>Global Scale</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
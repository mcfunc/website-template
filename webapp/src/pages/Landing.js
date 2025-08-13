import React from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

const Landing = () => {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <nav className="landing-nav">
          <div className="nav-brand">
            <h1>Site Template</h1>
          </div>
          <div className="nav-actions">
            <Link to="/login" className="btn btn-primary">
              Sign In
            </Link>
            <Link to="/register" className="btn btn-outline">
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero">
          <div className="hero-content">
            <h1>Build Applications Faster</h1>
            <p>
              A complete, reusable webstack template with authentication, 
              data integration, theming, and analytics built-in.
            </p>
            <div className="hero-actions">
              <Link to="/register" className="btn btn-primary btn-large">
                Start Building
              </Link>
              <Link to="/demo" className="btn btn-outline btn-large">
                View Demo
              </Link>
            </div>
          </div>
          <div className="hero-visual">
            <div className="feature-preview">
              <h3>Live Preview</h3>
              <div className="preview-chart">
                <div className="chart-bar" style={{height: '60%'}}></div>
                <div className="chart-bar" style={{height: '80%'}}></div>
                <div className="chart-bar" style={{height: '40%'}}></div>
                <div className="chart-bar" style={{height: '90%'}}></div>
                <div className="chart-bar" style={{height: '70%'}}></div>
              </div>
            </div>
          </div>
        </section>

        <section className="features">
          <div className="container">
            <h2>Features & Stages</h2>
            <div className="features-grid">
              <div className="feature-card completed">
                <div className="feature-icon">🔐</div>
                <h3>Authentication Ready</h3>
                <p>SSO integration with Auth0, secure user management, and role-based access control.</p>
                <span className="feature-status">✅ Stage 1 Complete</span>
              </div>
              <div className="feature-card completed">
                <div className="feature-icon">👤</div>
                <h3>User Profiles</h3>
                <p>Complete profile management, notification preferences, and personalized user experience.</p>
                <span className="feature-status">✅ Stage 2 Complete</span>
              </div>
              <div className="feature-card completed">
                <div className="feature-icon">🚀</div>
                <h3>API Integration</h3>
                <p>External API connections, data transformation, caching, and automated fetching.</p>
                <span className="feature-status">✅ Stage 3 Complete</span>
              </div>
              <div className="feature-card completed">
                <div className="feature-icon">🎨</div>
                <h3>Theming System</h3>
                <p>Multi-brand support, plugin architecture, and hot-swappable themes.</p>
                <span className="feature-status">✅ Stage 4 Complete</span>
              </div>
              <div className="feature-card completed">
                <div className="feature-icon">👑</div>
                <h3>Admin Dashboard</h3>
                <p>Admin tools, user metrics, A/B testing, and advanced monitoring capabilities.</p>
                <span className="feature-status">✅ Stage 5 Complete</span>
              </div>
              <div className="feature-card completed">
                <div className="feature-icon">📊</div>
                <h3>Advanced Analytics</h3>
                <p>Real-time widgets, live streaming, advanced analytics and micro-frontend architecture.</p>
                <span className="feature-status">✅ Stage 6 Complete</span>
              </div>
            </div>
          </div>
        </section>

        <section className="stage-progress">
          <div className="container">
            <h2>Implementation Progress</h2>
            <div className="progress-timeline">
              <div className="stage stage-complete">
                <div className="stage-marker">✓</div>
                <div className="stage-content">
                  <h3>Stage 0: Infrastructure</h3>
                  <p>Docker, CI/CD, deployment automation</p>
                </div>
              </div>
              <div className="stage stage-complete">
                <div className="stage-marker">✓</div>
                <div className="stage-content">
                  <h3>Stage 1: Authentication</h3>
                  <p>User management, SSO, RBAC, audit logging</p>
                </div>
              </div>
              <div className="stage stage-complete">
                <div className="stage-marker">✓</div>
                <div className="stage-content">
                  <h3>Stage 2: User Features</h3>
                  <p>Profile settings, notifications, public pages</p>
                </div>
              </div>
              <div className="stage stage-complete">
                <div className="stage-marker">✓</div>
                <div className="stage-content">
                  <h3>Stage 3: Data Pipeline</h3>
                  <p>API integration, caching, KPI calculations</p>
                </div>
              </div>
              <div className="stage stage-complete">
                <div className="stage-marker">✓</div>
                <div className="stage-content">
                  <h3>Stage 4: Theming System</h3>
                  <p>Multi-brand theming, plugin architecture, feature flags</p>
                </div>
              </div>
              <div className="stage stage-complete">
                <div className="stage-marker">✓</div>
                <div className="stage-content">
                  <h3>Stage 5: Admin Dashboard</h3>
                  <p>Admin tools, user metrics, A/B testing, advanced monitoring</p>
                </div>
              </div>
              <div className="stage stage-complete">
                <div className="stage-marker">✓</div>
                <div className="stage-content">
                  <h3>Stage 6: Advanced Analytics</h3>
                  <p>Real-time widgets, live streaming, micro-frontend architecture</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cta">
          <div className="container">
            <h2>Ready to get started?</h2>
            <p>Join thousands of developers building with our template.</p>
            <Link to="/register" className="btn btn-primary btn-large">
              Create Your Account
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <h3>Site Template</h3>
              <p>The complete webstack for modern applications.</p>
            </div>
            <div className="footer-links">
              <div className="link-group">
                <h4>Product</h4>
                <Link to="/features">Features</Link>
                <Link to="/pricing">Pricing</Link>
                <Link to="/docs">Documentation</Link>
              </div>
              <div className="link-group">
                <h4>Support</h4>
                <Link to="/help">Help Center</Link>
                <Link to="/contact">Contact</Link>
                <Link to="/status">Status</Link>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2024 Site Template. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
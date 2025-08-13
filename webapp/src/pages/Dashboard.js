import React from 'react';
import './Dashboard.css';

const Dashboard = ({ user }) => {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <h1>Welcome back, {user?.name || 'User'}!</h1>
            <p>Here's what's happening with your application today.</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-outline">Settings</button>
            <button className="btn btn-primary">New Project</button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-grid">
          {/* Quick Stats */}
          <section className="stats-section">
            <h2>Quick Stats</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <h3>Active Projects</h3>
                  <div className="stat-value">12</div>
                  <div className="stat-change positive">+2 this month</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-content">
                  <h3>Team Members</h3>
                  <div className="stat-value">8</div>
                  <div className="stat-change positive">+1 this week</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🚀</div>
                <div className="stat-content">
                  <h3>Deployments</h3>
                  <div className="stat-value">47</div>
                  <div className="stat-change positive">+12 today</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⚡</div>
                <div className="stat-content">
                  <h3>API Calls</h3>
                  <div className="stat-value">2.4K</div>
                  <div className="stat-change negative">-5% vs yesterday</div>
                </div>
              </div>
            </div>
          </section>

          {/* Recent Activity */}
          <section className="activity-section">
            <h2>Recent Activity</h2>
            <div className="activity-list">
              <div className="activity-item">
                <div className="activity-icon success">✓</div>
                <div className="activity-content">
                  <h4>Deployment successful</h4>
                  <p>Production environment updated with latest changes</p>
                  <span className="activity-time">2 minutes ago</span>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon info">📝</div>
                <div className="activity-content">
                  <h4>New user registered</h4>
                  <p>john.doe@example.com joined your organization</p>
                  <span className="activity-time">15 minutes ago</span>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon warning">⚠️</div>
                <div className="activity-content">
                  <h4>Rate limit warning</h4>
                  <p>API usage approaching monthly limit (85%)</p>
                  <span className="activity-time">1 hour ago</span>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon success">🔄</div>
                <div className="activity-content">
                  <h4>Data sync completed</h4>
                  <p>External API integration refreshed successfully</p>
                  <span className="activity-time">3 hours ago</span>
                </div>
              </div>
            </div>
          </section>

          {/* System Health */}
          <section className="health-section">
            <h2>System Health</h2>
            <div className="health-grid">
              <div className="health-card">
                <div className="health-header">
                  <h4>Database</h4>
                  <div className="status-indicator healthy"></div>
                </div>
                <div className="health-metric">
                  <span>Response Time</span>
                  <span>12ms</span>
                </div>
                <div className="health-metric">
                  <span>Connections</span>
                  <span>45/100</span>
                </div>
              </div>
              <div className="health-card">
                <div className="health-header">
                  <h4>Redis Cache</h4>
                  <div className="status-indicator healthy"></div>
                </div>
                <div className="health-metric">
                  <span>Hit Rate</span>
                  <span>94.2%</span>
                </div>
                <div className="health-metric">
                  <span>Memory Used</span>
                  <span>2.1GB</span>
                </div>
              </div>
              <div className="health-card">
                <div className="health-header">
                  <h4>API Service</h4>
                  <div className="status-indicator warning"></div>
                </div>
                <div className="health-metric">
                  <span>Uptime</span>
                  <span>99.8%</span>
                </div>
                <div className="health-metric">
                  <span>Avg Response</span>
                  <span>245ms</span>
                </div>
              </div>
            </div>
          </section>

          {/* Quick Actions */}
          <section className="actions-section">
            <h2>Quick Actions</h2>
            <div className="actions-grid">
              <button className="action-card">
                <div className="action-icon">📊</div>
                <h4>View Analytics</h4>
                <p>Deep dive into your data</p>
              </button>
              <button className="action-card">
                <div className="action-icon">🔧</div>
                <h4>Manage APIs</h4>
                <p>Configure integrations</p>
              </button>
              <button className="action-card">
                <div className="action-icon">👥</div>
                <h4>Team Settings</h4>
                <p>Invite and manage users</p>
              </button>
              <button className="action-card">
                <div className="action-icon">🎨</div>
                <h4>Customize Theme</h4>
                <p>Brand your application</p>
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
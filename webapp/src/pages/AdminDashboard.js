import React, { useState, useEffect } from 'react';
import { useTheme } from '../components/ThemeProvider';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const { user, isFeatureEnabled } = useTheme();
  const [dashboardData, setDashboardData] = useState(null);
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [activeTests, setActiveTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('24h');
  const [refreshInterval, setRefreshInterval] = useState(null);

  useEffect(() => {
    if (!isFeatureEnabled('enable_admin_dashboard')) {
      setError('Admin dashboard is not enabled');
      setLoading(false);
      return;
    }

    loadDashboardData();
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    setRefreshInterval(interval);
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timeframe]);

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      await Promise.all([
        loadMetrics(),
        loadSystemMetrics(),
        loadActiveTests()
      ]);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/admin/analytics/dashboard?timeframe=${timeframe}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load dashboard metrics');
    }

    const data = await response.json();
    setDashboardData(data);
  };

  const loadSystemMetrics = async () => {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/admin/system/metrics', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load system metrics');
    }

    const data = await response.json();
    setSystemMetrics(data);
  };

  const loadActiveTests = async () => {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/admin/ab-tests/active', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load A/B tests');
    }

    const data = await response.json();
    setActiveTests(data);
  };

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num?.toString() || '0';
  };

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <div className="error-container">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h1>Admin Dashboard</h1>
        <div className="dashboard-controls">
          <select 
            value={timeframe} 
            onChange={(e) => setTimeframe(e.target.value)}
            className="timeframe-selector"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button 
            onClick={loadDashboardData}
            className="refresh-button"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">👥</div>
          <div className="metric-content">
            <div className="metric-value">{formatNumber(dashboardData?.metrics?.activeUsers)}</div>
            <div className="metric-label">Active Users</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{formatNumber(dashboardData?.metrics?.totalSessions)}</div>
            <div className="metric-label">Total Sessions</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">👁️</div>
          <div className="metric-content">
            <div className="metric-value">{formatNumber(dashboardData?.metrics?.pageViews)}</div>
            <div className="metric-label">Page Views</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⚡</div>
          <div className="metric-content">
            <div className="metric-value">{formatNumber(dashboardData?.metrics?.totalEvents)}</div>
            <div className="metric-label">Events</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⏱️</div>
          <div className="metric-content">
            <div className="metric-value">{formatDuration(dashboardData?.metrics?.avgSessionDuration)}</div>
            <div className="metric-label">Avg Session</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📉</div>
          <div className="metric-content">
            <div className="metric-value">{dashboardData?.metrics?.bounceRate}%</div>
            <div className="metric-label">Bounce Rate</div>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        {/* System Health */}
        <div className="dashboard-section">
          <h2>System Health</h2>
          <div className="system-health-grid">
            {systemMetrics && Object.entries(systemMetrics).map(([service, metrics]) => (
              <div key={service} className="health-card">
                <div className="health-header">
                  <h3>{service}</h3>
                  <div className={`status-indicator ${metrics.status}`}>
                    {metrics.status === 'healthy' ? '🟢' : '🔴'}
                  </div>
                </div>
                <div className="health-metrics">
                  {Object.entries(metrics.data || {}).map(([key, value]) => (
                    <div key={key} className="health-metric">
                      <span className="metric-name">{key.replace(/_/g, ' ')}</span>
                      <span className="metric-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Pages */}
        <div className="dashboard-section">
          <h2>Top Pages</h2>
          <div className="top-pages-table">
            <div className="table-header">
              <div>Page</div>
              <div>Views</div>
              <div>Unique Users</div>
            </div>
            {dashboardData?.topPages?.slice(0, 10).map((page, index) => (
              <div key={index} className="table-row">
                <div className="page-path">{page.path}</div>
                <div>{formatNumber(page.views)}</div>
                <div>{formatNumber(page.unique_users)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* A/B Tests */}
        <div className="dashboard-section">
          <h2>Active A/B Tests</h2>
          <div className="ab-tests-grid">
            {activeTests.map(test => (
              <div key={test.id} className="ab-test-card">
                <div className="test-header">
                  <h3>{test.display_name}</h3>
                  <div className={`test-status ${test.status}`}>
                    {test.status}
                  </div>
                </div>
                <div className="test-content">
                  <p className="test-description">{test.description}</p>
                  <div className="test-metrics">
                    <div className="test-metric">
                      <span>Traffic:</span>
                      <span>{test.traffic_allocation}%</span>
                    </div>
                    <div className="test-metric">
                      <span>Variants:</span>
                      <span>{test.variants?.length || 0}</span>
                    </div>
                  </div>
                  <div className="test-variants">
                    {test.variants?.map(variant => (
                      <div key={variant.id} className="variant-chip">
                        {variant.display_name}
                        <span className="variant-weight">({variant.traffic_weight}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {activeTests.length === 0 && (
            <div className="empty-state">
              <h3>No Active A/B Tests</h3>
              <p>No A/B tests are currently running.</p>
            </div>
          )}
        </div>

        {/* Recent Events */}
        <div className="dashboard-section">
          <h2>Top Events</h2>
          <div className="events-table">
            <div className="table-header">
              <div>Event</div>
              <div>Type</div>
              <div>Count</div>
              <div>Unique Users</div>
            </div>
            {dashboardData?.topEvents?.slice(0, 10).map((event, index) => (
              <div key={index} className="table-row">
                <div className="event-name">{event.event_name}</div>
                <div className="event-type">{event.event_type}</div>
                <div>{formatNumber(event.count)}</div>
                <div>{formatNumber(event.unique_users)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
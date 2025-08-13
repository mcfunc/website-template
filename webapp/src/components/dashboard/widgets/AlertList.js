import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AlertList.css';

const AlertList = ({ config, widgetId, realTimeData, token }) => {
  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { 
    severity_filter = ['high', 'critical'], 
    limit = 10,
    show_acknowledged = false
  } = config;

  // Fetch initial alerts
  useEffect(() => {
    fetchAlerts();
  }, [widgetId, token]);

  // Listen for new alerts from WebSocket
  useEffect(() => {
    if (realTimeData && realTimeData.alerts) {
      setAlerts(prevAlerts => {
        const newAlerts = realTimeData.alerts.filter(newAlert => 
          !prevAlerts.find(existing => existing.id === newAlert.id)
        );
        return [...newAlerts, ...prevAlerts].slice(0, limit);
      });
    }
  }, [realTimeData, limit]);

  const fetchAlerts = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/dashboard/widgets/${widgetId}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.data && response.data.data.alerts) {
        setAlerts(response.data.data.alerts);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load alerts');
      console.error('Alerts fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const acknowledgeAlert = async (alertId) => {
    try {
      await axios.post(`/api/dashboard/alerts/${alertId}/acknowledge`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Update local state
      setAlerts(prevAlerts => 
        prevAlerts.map(alert => 
          alert.id === alertId 
            ? { ...alert, acknowledgment_status: 'acknowledged', acknowledged_at: new Date() }
            : alert
        )
      );
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      low: '#4CAF50',
      medium: '#FF9800', 
      high: '#FF5722',
      critical: '#F44336'
    };
    return colors[severity] || '#757575';
  };

  const getSeverityIcon = (severity) => {
    const icons = {
      low: '🔵',
      medium: '🟡',
      high: '🟠', 
      critical: '🔴'
    };
    return icons[severity] || '⚪';
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now - time;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
  };

  const filteredAlerts = alerts.filter(alert => {
    if (!severity_filter.includes(alert.severity)) return false;
    if (!show_acknowledged && alert.acknowledgment_status === 'acknowledged') return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="alert-list loading">
        <div className="loading-spinner"></div>
        <p>Loading alerts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert-list error">
        <p>{error}</p>
        <button onClick={fetchAlerts} className="retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (filteredAlerts.length === 0) {
    return (
      <div className="alert-list empty">
        <div className="empty-state">
          <span className="empty-icon">✅</span>
          <p>No active alerts</p>
          <small>All systems operating normally</small>
        </div>
      </div>
    );
  }

  return (
    <div className="alert-list">
      <div className="alert-header">
        <h4>Active Alerts ({filteredAlerts.length})</h4>
        <button onClick={fetchAlerts} className="refresh-btn">
          ↻
        </button>
      </div>

      <div className="alerts-container">
        {filteredAlerts.map(alert => (
          <div 
            key={alert.id} 
            className={`alert-item ${alert.severity} ${alert.acknowledgment_status}`}
          >
            <div className="alert-indicator">
              <span 
                className="severity-icon"
                style={{ color: getSeverityColor(alert.severity) }}
              >
                {getSeverityIcon(alert.severity)}
              </span>
            </div>
            
            <div className="alert-content">
              <div className="alert-title">
                {alert.rule_name}
              </div>
              <div className="alert-message">
                {alert.message}
              </div>
              <div className="alert-meta">
                <span className="alert-time">
                  {formatTimeAgo(alert.triggered_at)}
                </span>
                <span className="alert-severity">
                  {alert.severity.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="alert-actions">
              {alert.acknowledgment_status === 'unacknowledged' ? (
                <button 
                  onClick={() => acknowledgeAlert(alert.id)}
                  className="acknowledge-btn"
                  title="Acknowledge alert"
                >
                  ✓
                </button>
              ) : (
                <span className="acknowledged-badge" title="Acknowledged">
                  ✓ ACK
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredAlerts.length >= limit && (
        <div className="alert-footer">
          <p>Showing {limit} most recent alerts</p>
          <button onClick={fetchAlerts} className="load-more-btn">
            Refresh
          </button>
        </div>
      )}
    </div>
  );
};

export default AlertList;
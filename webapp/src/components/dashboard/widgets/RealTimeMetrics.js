import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './RealTimeMetrics.css';

const RealTimeMetrics = ({ config, widgetId, realTimeData, token }) => {
  const [metrics, setMetrics] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { 
    metrics: metricsConfig = ['active_users', 'page_views', 'errors'], 
    display_format = 'cards' 
  } = config;

  // Fetch initial data
  useEffect(() => {
    fetchMetrics();
  }, [widgetId, token]);

  // Update with real-time data when available
  useEffect(() => {
    if (realTimeData && typeof realTimeData === 'object') {
      setMetrics(realTimeData);
      setIsLoading(false);
    }
  }, [realTimeData]);

  const fetchMetrics = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/dashboard/widgets/${widgetId}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.data && response.data.data.metrics) {
        setMetrics(response.data.data.metrics);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load metrics');
      console.error('Metrics fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatMetricValue = (value, metric) => {
    if (typeof value === 'number') {
      if (metric.includes('rate') || metric.includes('percentage')) {
        return `${value.toFixed(2)}%`;
      }
      return value.toLocaleString();
    }
    return value?.toString() || '0';
  };

  const getMetricColor = (metric) => {
    const colorMap = {
      active_users: '#4CAF50',
      page_views: '#2196F3',
      errors: '#F44336',
      conversions: '#FF9800',
      revenue: '#9C27B0'
    };
    return colorMap[metric] || '#757575';
  };

  if (isLoading) {
    return (
      <div className="realtime-metrics loading">
        <div className="loading-spinner"></div>
        <p>Loading metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="realtime-metrics error">
        <p>{error}</p>
        <button onClick={fetchMetrics} className="retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (display_format === 'cards') {
    return (
      <div className="realtime-metrics cards">
        <div className="metrics-grid">
          {metricsConfig.map(metric => {
            const metricData = metrics[metric] || { value: 0, label: metric };
            return (
              <div 
                key={metric} 
                className="metric-card"
                style={{ borderLeft: `4px solid ${getMetricColor(metric)}` }}
              >
                <div className="metric-value">
                  {formatMetricValue(metricData.value || metricData, metric)}
                </div>
                <div className="metric-label">
                  {metricData.label || metric.replace(/_/g, ' ').toUpperCase()}
                </div>
                {metricData.change && (
                  <div className={`metric-change ${metricData.change > 0 ? 'positive' : 'negative'}`}>
                    {metricData.change > 0 ? '↑' : '↓'} {Math.abs(metricData.change)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {metrics.timestamp && (
          <div className="metrics-timestamp">
            Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    );
  }

  if (display_format === 'list') {
    return (
      <div className="realtime-metrics list">
        <div className="metrics-list">
          {metricsConfig.map(metric => {
            const metricData = metrics[metric] || { value: 0, label: metric };
            return (
              <div key={metric} className="metric-item">
                <span 
                  className="metric-indicator"
                  style={{ backgroundColor: getMetricColor(metric) }}
                />
                <span className="metric-name">
                  {metricData.label || metric.replace(/_/g, ' ')}
                </span>
                <span className="metric-value">
                  {formatMetricValue(metricData.value || metricData, metric)}
                </span>
              </div>
            );
          })}
        </div>
        {metrics.timestamp && (
          <div className="metrics-timestamp">
            Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="realtime-metrics compact">
      <div className="metrics-compact">
        {metricsConfig.map((metric, index) => {
          const metricData = metrics[metric] || { value: 0, label: metric };
          return (
            <React.Fragment key={metric}>
              <span className="compact-metric">
                <strong>{formatMetricValue(metricData.value || metricData, metric)}</strong>
                <small>{metricData.label || metric.replace(/_/g, ' ')}</small>
              </span>
              {index < metricsConfig.length - 1 && <span className="separator">|</span>}
            </React.Fragment>
          );
        })}
      </div>
      {metrics.timestamp && (
        <div className="metrics-timestamp">
          {new Date(metrics.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default RealTimeMetrics;
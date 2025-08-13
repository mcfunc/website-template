import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SystemHealth.css';

const SystemHealth = ({ config, widgetId, realTimeData, token }) => {
  const [healthData, setHealthData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { 
    services = ['database', 'redis', 'api'], 
    include_details = true 
  } = config;

  useEffect(() => {
    fetchHealthData();
  }, [widgetId, token]);

  useEffect(() => {
    if (realTimeData && realTimeData.services) {
      setHealthData(realTimeData);
      setIsLoading(false);
    }
  }, [realTimeData]);

  const fetchHealthData = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/dashboard/widgets/${widgetId}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.data) {
        setHealthData(response.data.data);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load system health');
      console.error('Health data fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getHealthIcon = (status) => {
    const icons = {
      healthy: '✅',
      unhealthy: '❌',
      degraded: '⚠️',
      unknown: '❓'
    };
    return icons[status] || '❓';
  };

  const getHealthColor = (status) => {
    const colors = {
      healthy: '#4CAF50',
      unhealthy: '#F44336', 
      degraded: '#FF9800',
      unknown: '#757575'
    };
    return colors[status] || '#757575';
  };

  if (isLoading) {
    return (
      <div className="system-health loading">
        <div className="loading-spinner"></div>
        <p>Checking system health...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="system-health error">
        <p>{error}</p>
        <button onClick={fetchHealthData} className="retry-btn">
          Retry
        </button>
      </div>
    );
  }

  const overallHealth = healthData.overallHealth || 'unknown';
  const servicesData = healthData.services || {};

  return (
    <div className="system-health">
      <div className="health-overview">
        <div className="overall-status">
          <span 
            className="status-icon"
            style={{ color: getHealthColor(overallHealth) }}
          >
            {getHealthIcon(overallHealth)}
          </span>
          <div className="status-text">
            <h3>System Status</h3>
            <p className={`status-label ${overallHealth}`}>
              {overallHealth.toUpperCase()}
            </p>
          </div>
        </div>
      </div>

      <div className="services-list">
        {services.map(serviceName => {
          const service = servicesData[serviceName] || { status: 'unknown' };
          return (
            <div key={serviceName} className="service-item">
              <div className="service-status">
                <span 
                  className="service-icon"
                  style={{ color: getHealthColor(service.status) }}
                >
                  {getHealthIcon(service.status)}
                </span>
                <div className="service-info">
                  <span className="service-name">
                    {serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}
                  </span>
                  <span className={`service-status-text ${service.status}`}>
                    {service.status}
                  </span>
                </div>
              </div>

              {include_details && service.lastCheck && (
                <div className="service-details">
                  <small>
                    Last check: {new Date(service.lastCheck).toLocaleTimeString()}
                  </small>
                  {service.error && (
                    <small className="error-message">
                      Error: {service.error}
                    </small>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {include_details && (
        <div className="health-footer">
          <small>
            Last updated: {new Date().toLocaleTimeString()}
          </small>
          <button onClick={fetchHealthData} className="refresh-health-btn">
            Check Again
          </button>
        </div>
      )}
    </div>
  );
};

export default SystemHealth;
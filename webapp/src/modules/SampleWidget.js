import React, { useState, useEffect } from 'react';

/**
 * Sample Widget - Example micro-frontend module
 * This demonstrates how to create a pluggable widget module
 */
const SampleWidget = ({ config = {}, context = {} }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Default configuration
  const {
    title = 'Sample Widget',
    refreshInterval = 30000,
    showMetrics = true,
    theme = 'light'
  } = config;

  // Sample data fetching
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const sampleData = {
          metrics: {
            totalUsers: Math.floor(Math.random() * 10000) + 5000,
            activeUsers: Math.floor(Math.random() * 3000) + 1000,
            revenue: (Math.random() * 50000 + 25000).toFixed(2),
            conversion: (Math.random() * 10 + 5).toFixed(1)
          },
          trend: Array.from({ length: 7 }, (_, i) => ({
            day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
            value: Math.floor(Math.random() * 100) + 50
          })),
          lastUpdated: new Date().toLocaleTimeString()
        };
        
        setData(sampleData);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Set up auto-refresh if configured
    let interval;
    if (refreshInterval > 0) {
      interval = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [refreshInterval]);

  // Emit events to parent application if context is available
  useEffect(() => {
    if (context.emit && data) {
      context.emit('dataUpdated', {
        moduleId: context.moduleId,
        data: data.metrics
      });
    }
  }, [data, context]);

  // Module cleanup function
  const cleanup = () => {
    console.log(`Sample Widget (${context.moduleId}) cleaning up...`);
  };

  // Styles based on theme
  const containerStyle = {
    padding: '20px',
    borderRadius: '8px',
    backgroundColor: theme === 'dark' ? '#333' : '#fff',
    color: theme === 'dark' ? '#fff' : '#333',
    border: theme === 'dark' ? '1px solid #555' : '1px solid #ddd',
    fontFamily: 'Arial, sans-serif',
    height: '100%',
    display: 'flex',
    flexDirection: 'column'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '10px',
    borderBottom: theme === 'dark' ? '1px solid #555' : '1px solid #eee'
  };

  const titleStyle = {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: theme === 'dark' ? '#fff' : '#333'
  };

  const timestampStyle = {
    fontSize: '12px',
    color: theme === 'dark' ? '#bbb' : '#666'
  };

  const metricsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '16px',
    marginBottom: '20px'
  };

  const metricCardStyle = {
    padding: '16px',
    borderRadius: '6px',
    backgroundColor: theme === 'dark' ? '#444' : '#f8f9fa',
    border: theme === 'dark' ? '1px solid #555' : '1px solid #e9ecef',
    textAlign: 'center'
  };

  const metricValueStyle = {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: '4px'
  };

  const metricLabelStyle = {
    fontSize: '12px',
    color: theme === 'dark' ? '#bbb' : '#666',
    textTransform: 'uppercase',
    fontWeight: '500'
  };

  const trendStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: '60px',
    padding: '10px',
    backgroundColor: theme === 'dark' ? '#444' : '#f8f9fa',
    borderRadius: '6px',
    border: theme === 'dark' ? '1px solid #555' : '1px solid #e9ecef'
  };

  const trendBarStyle = (value) => ({
    width: '12px',
    backgroundColor: '#007bff',
    borderRadius: '2px',
    height: `${(value / 100) * 40}px`,
    minHeight: '2px',
    transition: 'height 0.3s ease'
  });

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #007bff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p>Loading widget data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
          <h4 style={{ color: '#dc3545', marginBottom: '8px' }}>Error Loading Data</h4>
          <p style={{ fontSize: '14px', color: theme === 'dark' ? '#bbb' : '#666' }}>
            {error}
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '14px',
              marginTop: '12px'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>{title}</h3>
        <span style={timestampStyle}>
          Updated: {data?.lastUpdated}
        </span>
      </div>

      {showMetrics && data?.metrics && (
        <div style={metricsGridStyle}>
          <div style={metricCardStyle}>
            <div style={metricValueStyle}>{data.metrics.totalUsers.toLocaleString()}</div>
            <div style={metricLabelStyle}>Total Users</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricValueStyle}>{data.metrics.activeUsers.toLocaleString()}</div>
            <div style={metricLabelStyle}>Active Users</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricValueStyle}>${data.metrics.revenue}</div>
            <div style={metricLabelStyle}>Revenue</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricValueStyle}>{data.metrics.conversion}%</div>
            <div style={metricLabelStyle}>Conversion</div>
          </div>
        </div>
      )}

      {data?.trend && (
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: '14px', marginBottom: '12px', color: theme === 'dark' ? '#bbb' : '#666' }}>
            7-Day Trend
          </h4>
          <div style={trendStyle}>
            {data.trend.map((item, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={trendBarStyle(item.value)} title={`${item.day}: ${item.value}`}></div>
                <span style={{ fontSize: '10px', color: theme === 'dark' ? '#bbb' : '#666' }}>
                  {item.day}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        marginTop: '16px',
        padding: '12px',
        backgroundColor: theme === 'dark' ? '#444' : '#e9ecef',
        borderRadius: '4px',
        fontSize: '12px',
        color: theme === 'dark' ? '#bbb' : '#666'
      }}>
        <strong>Module Info:</strong> {context.moduleId} | 
        <strong> Theme:</strong> {theme} | 
        <strong> Auto-refresh:</strong> {refreshInterval > 0 ? `${refreshInterval / 1000}s` : 'Disabled'}
      </div>
    </div>
  );
};

// Module factory function for micro-frontend system
const SampleWidgetModule = (context) => {
  console.log('Initializing Sample Widget Module:', context);
  
  return {
    Component: SampleWidget,
    name: 'Sample Widget',
    version: '1.0.0',
    type: 'widget',
    
    // Render method for direct rendering
    render: (config) => React.createElement(SampleWidget, { config, context }),
    
    // Update configuration method
    updateConfig: async (newConfig) => {
      console.log('Updating Sample Widget config:', newConfig);
      // Could trigger re-render or emit events
      if (context.emit) {
        context.emit('configUpdated', newConfig);
      }
    },
    
    // Cleanup method
    cleanup: () => {
      console.log('Sample Widget module cleanup');
    },
    
    // Module capabilities
    capabilities: ['metrics', 'trending', 'auto-refresh', 'theming'],
    
    // Default configuration schema
    configSchema: {
      title: { type: 'string', default: 'Sample Widget' },
      refreshInterval: { type: 'number', default: 30000, min: 5000 },
      showMetrics: { type: 'boolean', default: true },
      theme: { type: 'string', enum: ['light', 'dark'], default: 'light' }
    }
  };
};

// Export both the component and module factory
export default SampleWidgetModule;
export { SampleWidget };
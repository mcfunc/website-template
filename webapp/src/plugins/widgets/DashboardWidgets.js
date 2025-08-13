import React, { useState, useEffect } from 'react';

const DashboardWidgets = ({ 
  userId = null,
  configuration = {},
  onConfigurationChange = () => {},
  apiClient = null
}) => {
  const [widgets, setWidgets] = useState(configuration.widgets || []);
  const [availableWidgets] = useState([
    {
      id: 'api-status',
      name: 'API Status',
      description: 'Shows the status of external API integrations',
      type: 'status',
      size: 'small'
    },
    {
      id: 'recent-activity',
      name: 'Recent Activity',
      description: 'Shows recent user activity and system events',
      type: 'list',
      size: 'medium'
    },
    {
      id: 'kpi-overview',
      name: 'KPI Overview',
      description: 'Shows key performance indicators and metrics',
      type: 'chart',
      size: 'large'
    },
    {
      id: 'feature-flags',
      name: 'Feature Flags',
      description: 'Shows active feature flags and their status',
      type: 'status',
      size: 'small'
    }
  ]);

  const [isConfigMode, setIsConfigMode] = useState(false);
  const [widgetData, setWidgetData] = useState({});

  useEffect(() => {
    loadWidgetData();
  }, [widgets]);

  const loadWidgetData = async () => {
    const data = {};
    
    for (const widget of widgets) {
      try {
        switch (widget.id) {
          case 'api-status':
            data[widget.id] = await loadAPIStatus();
            break;
          case 'recent-activity':
            data[widget.id] = await loadRecentActivity();
            break;
          case 'kpi-overview':
            data[widget.id] = await loadKPIOverview();
            break;
          case 'feature-flags':
            data[widget.id] = await loadFeatureFlags();
            break;
          default:
            data[widget.id] = { error: 'Unknown widget type' };
        }
      } catch (error) {
        data[widget.id] = { error: error.message };
      }
    }
    
    setWidgetData(data);
  };

  const loadAPIStatus = async () => {
    // Mock API status data
    return {
      total_apis: 4,
      active_apis: 3,
      failed_apis: 1,
      last_check: new Date().toISOString(),
      apis: [
        { name: 'JSONPlaceholder', status: 'healthy', response_time: 120 },
        { name: 'GitHub API', status: 'healthy', response_time: 250 },
        { name: 'Stripe API', status: 'healthy', response_time: 180 },
        { name: 'MockAPI', status: 'error', response_time: null }
      ]
    };
  };

  const loadRecentActivity = async () => {
    // Mock activity data
    return {
      activities: [
        { id: 1, type: 'api_call', description: 'Fetched user data from JSONPlaceholder', timestamp: new Date(Date.now() - 5 * 60000) },
        { id: 2, type: 'theme_change', description: 'User switched to dark theme', timestamp: new Date(Date.now() - 15 * 60000) },
        { id: 3, type: 'plugin_enabled', description: 'Enabled analytics plugin', timestamp: new Date(Date.now() - 30 * 60000) },
        { id: 4, type: 'data_processed', description: 'Processed 150 transaction records', timestamp: new Date(Date.now() - 45 * 60000) }
      ]
    };
  };

  const loadKPIOverview = async () => {
    // Mock KPI data
    return {
      metrics: [
        { name: 'API Calls Today', value: 1247, change: '+12%', trend: 'up' },
        { name: 'Data Records Processed', value: 8592, change: '+5%', trend: 'up' },
        { name: 'Active Users', value: 324, change: '-2%', trend: 'down' },
        { name: 'System Uptime', value: '99.8%', change: '+0.1%', trend: 'up' }
      ]
    };
  };

  const loadFeatureFlags = async () => {
    // Mock feature flags data
    return {
      flags: [
        { name: 'enable_dark_mode', enabled: true, rollout: 100 },
        { name: 'enable_plugin_system', enabled: true, rollout: 100 },
        { name: 'enable_custom_themes', enabled: true, rollout: 50 },
        { name: 'enable_theme_preview', enabled: true, rollout: 75 }
      ]
    };
  };

  const addWidget = (widgetType) => {
    const newWidget = {
      ...widgetType,
      instanceId: Date.now(),
      position: widgets.length,
      enabled: true
    };
    
    const updatedWidgets = [...widgets, newWidget];
    setWidgets(updatedWidgets);
    onConfigurationChange({ widgets: updatedWidgets });
  };

  const removeWidget = (instanceId) => {
    const updatedWidgets = widgets.filter(w => w.instanceId !== instanceId);
    setWidgets(updatedWidgets);
    onConfigurationChange({ widgets: updatedWidgets });
  };

  const moveWidget = (instanceId, direction) => {
    const currentIndex = widgets.findIndex(w => w.instanceId === instanceId);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex >= 0 && newIndex < widgets.length) {
      const updatedWidgets = [...widgets];
      [updatedWidgets[currentIndex], updatedWidgets[newIndex]] = [updatedWidgets[newIndex], updatedWidgets[currentIndex]];
      setWidgets(updatedWidgets);
      onConfigurationChange({ widgets: updatedWidgets });
    }
  };

  return (
    <div className="dashboard-widgets" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <button
          onClick={() => setIsConfigMode(!isConfigMode)}
          style={{
            padding: '8px 16px',
            background: isConfigMode ? 'var(--brand-accent, #28a745)' : 'var(--brand-primary, #007bff)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isConfigMode ? 'Exit Config' : 'Configure'}
        </button>
      </div>

      {isConfigMode && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '16px', 
          background: 'var(--muted, #f8f9fa)', 
          borderRadius: '8px' 
        }}>
          <h3 style={{ marginTop: 0 }}>Add Widgets</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {availableWidgets.map(widget => (
              <button
                key={widget.id}
                onClick={() => addWidget(widget)}
                disabled={widgets.some(w => w.id === widget.id)}
                style={{
                  padding: '8px 12px',
                  background: widgets.some(w => w.id === widget.id) ? '#ccc' : 'var(--brand-primary, #007bff)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: widgets.some(w => w.id === widget.id) ? 'not-allowed' : 'pointer',
                  fontSize: '12px'
                }}
              >
                {widget.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '20px' 
      }}>
        {widgets.map(widget => (
          <WidgetContainer
            key={widget.instanceId}
            widget={widget}
            data={widgetData[widget.id]}
            isConfigMode={isConfigMode}
            onRemove={() => removeWidget(widget.instanceId)}
            onMove={(direction) => moveWidget(widget.instanceId, direction)}
          />
        ))}
      </div>

      {widgets.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          color: '#666' 
        }}>
          <h3>No widgets configured</h3>
          <p>Click "Configure" to add widgets to your dashboard</p>
        </div>
      )}
    </div>
  );
};

const WidgetContainer = ({ widget, data, isConfigMode, onRemove, onMove }) => {
  const getSizeStyle = (size) => {
    switch (size) {
      case 'small':
        return { gridColumn: 'span 1', minHeight: '200px' };
      case 'medium':
        return { gridColumn: 'span 1', minHeight: '300px' };
      case 'large':
        return { gridColumn: 'span 2', minHeight: '400px' };
      default:
        return { gridColumn: 'span 1', minHeight: '250px' };
    }
  };

  return (
    <div
      style={{
        ...getSizeStyle(widget.size),
        background: 'white',
        border: '1px solid var(--border, #dee2e6)',
        borderRadius: '8px',
        padding: '16px',
        position: 'relative'
      }}
    >
      {isConfigMode && (
        <div style={{ 
          position: 'absolute', 
          top: '8px', 
          right: '8px', 
          display: 'flex', 
          gap: '4px' 
        }}>
          <button
            onClick={() => onMove('up')}
            style={{
              padding: '4px 8px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '10px'
            }}
          >
            ↑
          </button>
          <button
            onClick={() => onMove('down')}
            style={{
              padding: '4px 8px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '10px'
            }}
          >
            ↓
          </button>
          <button
            onClick={onRemove}
            style={{
              padding: '4px 8px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '10px'
            }}
          >
            ×
          </button>
        </div>
      )}

      <h4 style={{ marginTop: 0, marginBottom: '16px' }}>{widget.name}</h4>
      
      {data?.error ? (
        <div style={{ color: '#dc3545', padding: '20px', textAlign: 'center' }}>
          Error: {data.error}
        </div>
      ) : (
        <WidgetContent widget={widget} data={data} />
      )}
    </div>
  );
};

const WidgetContent = ({ widget, data }) => {
  if (!data) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>;
  }

  switch (widget.id) {
    case 'api-status':
      return (
        <div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <StatusBadge label="Total" value={data.total_apis} color="#6c757d" />
            <StatusBadge label="Active" value={data.active_apis} color="#28a745" />
            <StatusBadge label="Failed" value={data.failed_apis} color="#dc3545" />
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {data.apis.map(api => (
              <div key={api.name} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '4px 0' 
              }}>
                <span>{api.name}</span>
                <span style={{ 
                  color: api.status === 'healthy' ? '#28a745' : '#dc3545' 
                }}>
                  {api.status === 'healthy' ? `${api.response_time}ms` : 'Error'}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'recent-activity':
      return (
        <div>
          {data.activities.map(activity => (
            <div key={activity.id} style={{ 
              padding: '8px 0', 
              borderBottom: '1px solid #eee' 
            }}>
              <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                {activity.description}
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {activity.timestamp.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      );

    case 'kpi-overview':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {data.metrics.map(metric => (
            <div key={metric.name} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '4px' }}>
                {metric.value}
              </div>
              <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                {metric.name}
              </div>
              <div style={{ 
                fontSize: '10px', 
                color: metric.trend === 'up' ? '#28a745' : '#dc3545' 
              }}>
                {metric.change}
              </div>
            </div>
          ))}
        </div>
      );

    case 'feature-flags':
      return (
        <div>
          {data.flags.map(flag => (
            <div key={flag.name} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid #eee'
            }}>
              <div>
                <div style={{ fontSize: '14px' }}>{flag.name}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  Rollout: {flag.rollout}%
                </div>
              </div>
              <div style={{
                padding: '4px 8px',
                borderRadius: '12px',
                background: flag.enabled ? '#28a745' : '#dc3545',
                color: 'white',
                fontSize: '10px'
              }}>
                {flag.enabled ? 'ON' : 'OFF'}
              </div>
            </div>
          ))}
        </div>
      );

    default:
      return <div>Unknown widget type</div>;
  }
};

const StatusBadge = ({ label, value, color }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ 
      background: color, 
      color: 'white', 
      borderRadius: '50%', 
      width: '32px', 
      height: '32px', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontSize: '14px',
      fontWeight: 'bold',
      margin: '0 auto 4px'
    }}>
      {value}
    </div>
    <div style={{ fontSize: '10px', color: '#666' }}>{label}</div>
  </div>
);

export default DashboardWidgets;
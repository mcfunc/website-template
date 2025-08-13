import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import io from 'socket.io-client';
import axios from 'axios';
import WidgetWrapper from './WidgetWrapper';
import WidgetLibrary from './widgets';
import './DashboardCanvas.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const DashboardCanvas = ({ dashboardName = 'default', userId, token }) => {
  const [widgets, setWidgets] = useState([]);
  const [layout, setLayout] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [availableWidgets, setAvailableWidgets] = useState([]);
  const [realTimeData, setRealTimeData] = useState({});
  const socketRef = useRef(null);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!token) return;

    socketRef.current = io({
      auth: { token },
      transports: ['websocket']
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('stream_data', (data) => {
      const { streamName, data: streamData } = data;
      setRealTimeData(prev => ({
        ...prev,
        [streamName]: streamData
      }));
    });

    socket.on('new_alert', (alert) => {
      // Handle new alerts
      console.log('New alert received:', alert);
      // Could show a toast notification or update alert widgets
    });

    socket.on('realtime_data', (data) => {
      const { type, data: responseData } = data;
      setRealTimeData(prev => ({
        ...prev,
        [type]: responseData
      }));
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [token]);

  // Load dashboard configuration
  const loadDashboard = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      
      const response = await axios.get(`/api/dashboard/dashboards/${dashboardName}/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const config = response.data;
      
      if (config.widgets && config.widgets.length > 0) {
        setWidgets(config.widgets);
        
        // Convert widgets to grid layout
        const gridLayout = config.widgets.map(widget => ({
          i: widget.id,
          x: widget.position.x,
          y: widget.position.y,
          w: widget.position.width,
          h: widget.position.height,
          minW: 2,
          minH: 2
        }));
        
        setLayout(gridLayout);

        // Subscribe to real-time streams for widgets that need it
        config.widgets
          .filter(widget => widget.is_realtime && widget.data_source === 'realtime')
          .forEach(widget => {
            if (socketRef.current) {
              socketRef.current.emit('subscribe', { 
                streamName: widget.data_source,
                options: widget.config 
              });
            }
          });
      } else {
        setWidgets([]);
        setLayout([]);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dashboardName, token]);

  // Load available widget types
  const loadAvailableWidgets = useCallback(async () => {
    if (!token) return;

    try {
      const response = await axios.get('/api/dashboard/widget-types', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableWidgets(response.data);
    } catch (error) {
      console.error('Failed to load widget types:', error);
    }
  }, [token]);

  useEffect(() => {
    loadDashboard();
    loadAvailableWidgets();
  }, [loadDashboard, loadAvailableWidgets]);

  // Handle layout changes
  const onLayoutChange = useCallback(async (newLayout) => {
    setLayout(newLayout);
    
    if (!isEditMode) return;

    // Update widget positions in backend
    try {
      const updatePromises = newLayout.map(async (layoutItem) => {
        const widget = widgets.find(w => w.id === layoutItem.i);
        if (!widget) return;

        return axios.put(`/api/dashboard/widgets/${widget.id}`, {
          position_x: layoutItem.x,
          position_y: layoutItem.y,
          width: layoutItem.w,
          height: layoutItem.h
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      });

      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Failed to update widget positions:', error);
    }
  }, [widgets, isEditMode, token]);

  // Add new widget
  const addWidget = async (widgetType) => {
    try {
      const response = await axios.post(`/api/dashboard/dashboards/${dashboardName}/widgets`, {
        widget_type_id: widgetType.id,
        position_x: 0,
        position_y: 0,
        width: 4,
        height: 3,
        config: widgetType.default_config
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        loadDashboard(); // Reload to get updated widget list
      }
    } catch (error) {
      console.error('Failed to add widget:', error);
    }
  };

  // Remove widget
  const removeWidget = async (widgetId) => {
    try {
      await axios.delete(`/api/dashboard/widgets/${widgetId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      loadDashboard(); // Reload to get updated widget list
      
      // Remove from layout
      setLayout(prev => prev.filter(item => item.i !== widgetId));
    } catch (error) {
      console.error('Failed to remove widget:', error);
    }
  };

  // Render widget content
  const renderWidget = (widget) => {
    const WidgetComponent = WidgetLibrary[widget.widget_type];
    
    if (!WidgetComponent) {
      return (
        <div className="widget-error">
          <p>Widget type '{widget.widget_type}' not found</p>
        </div>
      );
    }

    return (
      <WidgetWrapper
        key={widget.id}
        widget={widget}
        isEditMode={isEditMode}
        onRemove={() => removeWidget(widget.id)}
        realTimeData={realTimeData}
        token={token}
      >
        <WidgetComponent
          config={widget.config}
          widgetId={widget.id}
          realTimeData={realTimeData[widget.data_source]}
          refreshInterval={widget.refresh_interval}
          token={token}
        />
      </WidgetWrapper>
    );
  };

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-canvas">
      <div className="dashboard-header">
        <h2>Dashboard: {dashboardName === 'default' ? 'Default' : dashboardName}</h2>
        <div className="dashboard-controls">
          <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className={`edit-mode-btn ${isEditMode ? 'active' : ''}`}
          >
            {isEditMode ? 'Exit Edit' : 'Edit'}
          </button>
          <button onClick={loadDashboard} className="refresh-btn">
            Refresh
          </button>
        </div>
      </div>

      {isEditMode && (
        <div className="widget-toolbar">
          <h3>Add Widget:</h3>
          <div className="widget-types">
            {availableWidgets.map(widgetType => (
              <button
                key={widgetType.id}
                onClick={() => addWidget(widgetType)}
                className="widget-type-btn"
                title={widgetType.description}
              >
                {widgetType.display_name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        {widgets.length === 0 ? (
          <div className="empty-dashboard">
            <p>No widgets configured for this dashboard.</p>
            {isEditMode && <p>Use the toolbar above to add widgets.</p>}
          </div>
        ) : (
          <ResponsiveGridLayout
            className="dashboard-layout"
            layouts={{ lg: layout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={60}
            isDraggable={isEditMode}
            isResizable={isEditMode}
            onLayoutChange={onLayoutChange}
            margin={[16, 16]}
            containerPadding={[16, 16]}
          >
            {widgets.map(widget => (
              <div key={widget.id} className="widget-container">
                {renderWidget(widget)}
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
};

export default DashboardCanvas;
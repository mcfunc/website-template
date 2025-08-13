import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './WidgetWrapper.css';

const WidgetWrapper = ({ 
  children, 
  widget, 
  isEditMode, 
  onRemove, 
  realTimeData, 
  token 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const refreshIntervalRef = useRef(null);

  // Auto-refresh for non-realtime widgets
  useEffect(() => {
    if (!widget.is_realtime && widget.refresh_interval && widget.refresh_interval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        setLastUpdated(new Date());
      }, widget.refresh_interval * 1000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [widget.is_realtime, widget.refresh_interval]);

  // Update last updated when real-time data changes
  useEffect(() => {
    if (widget.is_realtime && realTimeData) {
      setLastUpdated(new Date());
    }
  }, [realTimeData, widget.is_realtime]);

  const refreshWidget = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await axios.get(`/api/dashboard/widgets/${widget.id}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to refresh widget data');
      console.error('Widget refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigSave = async (newConfig) => {
    try {
      await axios.put(`/api/dashboard/widgets/${widget.id}`, {
        config: newConfig
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setIsConfigOpen(false);
      refreshWidget();
    } catch (err) {
      setError('Failed to update widget configuration');
      console.error('Widget config update error:', err);
    }
  };

  return (
    <div className={`widget-wrapper ${isEditMode ? 'edit-mode' : ''}`}>
      <div className="widget-header">
        <div className="widget-title">
          <h4>{widget.display_name}</h4>
          {widget.is_realtime && (
            <span className="realtime-indicator" title="Real-time widget">
              🔴 LIVE
            </span>
          )}
        </div>
        
        <div className="widget-controls">
          {isEditMode && (
            <>
              <button 
                className="widget-control-btn"
                onClick={() => setIsConfigOpen(true)}
                title="Configure widget"
              >
                ⚙️
              </button>
              <button 
                className="widget-control-btn remove-btn"
                onClick={onRemove}
                title="Remove widget"
              >
                ✕
              </button>
            </>
          )}
          
          {!widget.is_realtime && (
            <button 
              className="widget-control-btn"
              onClick={refreshWidget}
              disabled={isLoading}
              title="Refresh data"
            >
              {isLoading ? '⟳' : '↻'}
            </button>
          )}
        </div>
      </div>

      <div className="widget-content">
        {error ? (
          <div className="widget-error">
            <p>{error}</p>
            <button onClick={refreshWidget} className="retry-btn">
              Retry
            </button>
          </div>
        ) : (
          children
        )}
      </div>

      <div className="widget-footer">
        <span className="last-updated">
          Updated: {lastUpdated.toLocaleTimeString()}
        </span>
        {widget.refresh_interval && !widget.is_realtime && (
          <span className="refresh-interval">
            Refreshes every {widget.refresh_interval}s
          </span>
        )}
      </div>

      {/* Configuration Modal */}
      {isConfigOpen && (
        <WidgetConfigModal
          widget={widget}
          onSave={handleConfigSave}
          onCancel={() => setIsConfigOpen(false)}
        />
      )}
    </div>
  );
};

// Widget Configuration Modal Component
const WidgetConfigModal = ({ widget, onSave, onCancel }) => {
  const [config, setConfig] = useState(widget.config);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(config);
  };

  const updateConfigField = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const renderConfigField = (key, value) => {
    if (typeof value === 'boolean') {
      return (
        <label key={key} className="config-field">
          <span>{key.replace(/_/g, ' ')}:</span>
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => updateConfigField(key, e.target.checked)}
          />
        </label>
      );
    }

    if (typeof value === 'number') {
      return (
        <label key={key} className="config-field">
          <span>{key.replace(/_/g, ' ')}:</span>
          <input
            type="number"
            value={value}
            onChange={(e) => updateConfigField(key, parseInt(e.target.value))}
          />
        </label>
      );
    }

    if (Array.isArray(value)) {
      return (
        <label key={key} className="config-field">
          <span>{key.replace(/_/g, ' ')}:</span>
          <input
            type="text"
            value={value.join(', ')}
            onChange={(e) => updateConfigField(key, e.target.value.split(', '))}
            placeholder="Comma-separated values"
          />
        </label>
      );
    }

    return (
      <label key={key} className="config-field">
        <span>{key.replace(/_/g, ' ')}:</span>
        <input
          type="text"
          value={value}
          onChange={(e) => updateConfigField(key, e.target.value)}
        />
      </label>
    );
  };

  return (
    <div className="widget-config-modal-overlay">
      <div className="widget-config-modal">
        <div className="modal-header">
          <h3>Configure {widget.display_name}</h3>
          <button onClick={onCancel} className="close-btn">✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          {Object.entries(config).map(([key, value]) => 
            renderConfigField(key, value)
          )}
          
          <div className="modal-actions">
            <button type="button" onClick={onCancel} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="save-btn">
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WidgetWrapper;
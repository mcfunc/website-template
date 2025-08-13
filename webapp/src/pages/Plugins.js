import React, { useState, useEffect } from 'react';
import { useTheme } from '../components/ThemeProvider';
import './Plugins.css';

const Plugins = () => {
  const { isFeatureEnabled } = useTheme();
  const [plugins, setPlugins] = useState([]);
  const [loadedPlugins, setLoadedPlugins] = useState([]);
  const [featureFlags, setFeatureFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('plugins');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadPlugins(),
        loadLoadedPlugins(),
        loadFeatureFlags()
      ]);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPlugins = async () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/plugins/', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load plugins');
    }

    const pluginsData = await response.json();
    setPlugins(pluginsData);
  };

  const loadLoadedPlugins = async () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/plugins/runtime/loaded', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load runtime plugins');
    }

    const loadedData = await response.json();
    setLoadedPlugins(loadedData);
  };

  const loadFeatureFlags = async () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/plugins/features/flags', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load feature flags');
    }

    const flagsData = await response.json();
    setFeatureFlags(flagsData);
  };

  const handlePluginToggle = async (pluginId, enable) => {
    try {
      const token = localStorage.getItem('token');
      const action = enable ? 'enable' : 'disable';
      
      const response = await fetch(`/api/plugins/${pluginId}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} plugin`);
      }

      // Reload plugins data
      await loadData();
    } catch (error) {
      setError(error.message);
    }
  };

  const handleFeatureFlagToggle = async (flagName, currentValue) => {
    try {
      const token = localStorage.getItem('token');
      const newValue = !currentValue;
      
      const response = await fetch(`/api/plugins/features/flags/${flagName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          value: newValue,
          reason: `Toggled via UI by user`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update feature flag');
      }

      // Reload feature flags data
      await loadFeatureFlags();
    } catch (error) {
      setError(error.message);
    }
  };

  if (loading) {
    return (
      <div className="plugins-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading plugins...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="plugins-page">
      <div className="plugins-header">
        <h1>Plugins & Features</h1>
        <p>Manage plugins and feature flags to customize your application functionality.</p>
        
        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
      </div>

      {/* System Status */}
      <div className="system-status">
        <div className="status-item">
          <span className="status-label">Plugin System:</span>
          <span className={`status-value ${isFeatureEnabled('enable_plugin_system') ? 'enabled' : 'disabled'}`}>
            {isFeatureEnabled('enable_plugin_system') ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">Total Plugins:</span>
          <span className="status-value">{plugins.length}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Loaded Plugins:</span>
          <span className="status-value">{loadedPlugins.length}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Active Flags:</span>
          <span className="status-value">{featureFlags.filter(f => f.active).length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'plugins' ? 'active' : ''}`}
            onClick={() => setActiveTab('plugins')}
          >
            <span>🧩</span>
            Plugins
          </button>
          <button 
            className={`tab ${activeTab === 'features' ? 'active' : ''}`}
            onClick={() => setActiveTab('features')}
          >
            <span>🚩</span>
            Feature Flags
          </button>
          <button 
            className={`tab ${activeTab === 'runtime' ? 'active' : ''}`}
            onClick={() => setActiveTab('runtime')}
          >
            <span>⚡</span>
            Runtime
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'plugins' && (
          <PluginsTab 
            plugins={plugins} 
            onToggle={handlePluginToggle}
            isSystemEnabled={isFeatureEnabled('enable_plugin_system')}
          />
        )}
        
        {activeTab === 'features' && (
          <FeatureFlagsTab 
            featureFlags={featureFlags} 
            onToggle={handleFeatureFlagToggle}
          />
        )}
        
        {activeTab === 'runtime' && (
          <RuntimeTab 
            loadedPlugins={loadedPlugins}
          />
        )}
      </div>
    </div>
  );
};

const PluginsTab = ({ plugins, onToggle, isSystemEnabled }) => {
  const getPluginTypeIcon = (type) => {
    const icons = {
      component: '🎨',
      service: '⚙️',
      middleware: '🔗',
      widget: '📊'
    };
    return icons[type] || '🧩';
  };

  const getPluginTypeColor = (type) => {
    const colors = {
      component: '#007bff',
      service: '#28a745',
      middleware: '#ffc107',
      widget: '#dc3545'
    };
    return colors[type] || '#6c757d';
  };

  if (!isSystemEnabled) {
    return (
      <div className="system-disabled">
        <h3>Plugin System Disabled</h3>
        <p>The plugin system is currently disabled. Enable the "enable_plugin_system" feature flag to use plugins.</p>
      </div>
    );
  }

  return (
    <div className="plugins-tab">
      <div className="plugins-grid">
        {plugins.map(plugin => (
          <div key={plugin.id} className={`plugin-card ${plugin.enabled ? 'enabled' : 'disabled'}`}>
            <div className="plugin-header">
              <div className="plugin-icon" style={{ color: getPluginTypeColor(plugin.plugin_type) }}>
                {getPluginTypeIcon(plugin.plugin_type)}
              </div>
              <div className="plugin-info">
                <h3>{plugin.display_name}</h3>
                <div className="plugin-meta">
                  <span className="plugin-version">v{plugin.version}</span>
                  <span className={`plugin-type ${plugin.plugin_type}`}>
                    {plugin.plugin_type}
                  </span>
                </div>
              </div>
              <div className="plugin-status">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={plugin.enabled}
                    onChange={(e) => onToggle(plugin.id, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
            
            <div className="plugin-body">
              <p className="plugin-description">{plugin.description}</p>
              
              <div className="plugin-details">
                <div className="detail-item">
                  <span className="detail-label">Author:</span>
                  <span className="detail-value">{plugin.author}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Entry Point:</span>
                  <span className="detail-value">{plugin.entry_point}</span>
                </div>
                {plugin.dependencies && plugin.dependencies.length > 0 && (
                  <div className="detail-item">
                    <span className="detail-label">Dependencies:</span>
                    <div className="dependencies">
                      {(typeof plugin.dependencies === 'string' 
                        ? JSON.parse(plugin.dependencies) 
                        : plugin.dependencies
                      ).map(dep => (
                        <span key={dep} className="dependency-tag">{dep}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {plugins.length === 0 && (
        <div className="empty-state">
          <h3>No Plugins Available</h3>
          <p>No plugins are currently registered in the system.</p>
        </div>
      )}
    </div>
  );
};

const FeatureFlagsTab = ({ featureFlags, onToggle }) => {
  const getFlagIcon = (flagType) => {
    const icons = {
      boolean: '🔘',
      string: '📝',
      number: '🔢',
      json: '📋'
    };
    return icons[flagType] || '🚩';
  };

  const getFlagValue = (flag) => {
    try {
      const value = typeof flag.current_value === 'string' 
        ? JSON.parse(flag.current_value) 
        : flag.current_value;
      
      if (flag.flag_type === 'boolean') {
        return value;
      }
      return JSON.stringify(value);
    } catch {
      return flag.current_value;
    }
  };

  const isBooleanFlag = (flag) => {
    return flag.flag_type === 'boolean';
  };

  return (
    <div className="features-tab">
      <div className="features-grid">
        {featureFlags.map(flag => (
          <div key={flag.id} className={`feature-card ${flag.active ? 'active' : 'inactive'}`}>
            <div className="feature-header">
              <div className="feature-icon">
                {getFlagIcon(flag.flag_type)}
              </div>
              <div className="feature-info">
                <h3>{flag.display_name}</h3>
                <code className="feature-name">{flag.name}</code>
              </div>
              {isBooleanFlag(flag) && (
                <div className="feature-toggle">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={getFlagValue(flag)}
                      onChange={() => onToggle(flag.name, getFlagValue(flag))}
                      disabled={!flag.active}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              )}
            </div>
            
            <div className="feature-body">
              <p className="feature-description">{flag.description}</p>
              
              <div className="feature-details">
                <div className="detail-row">
                  <span className="detail-label">Type:</span>
                  <span className={`flag-type ${flag.flag_type}`}>{flag.flag_type}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Environment:</span>
                  <span className="environment-tag">{flag.environment}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Rollout:</span>
                  <div className="rollout-bar">
                    <div 
                      className="rollout-progress" 
                      style={{ width: `${flag.rollout_percentage}%` }}
                    ></div>
                    <span className="rollout-text">{flag.rollout_percentage}%</span>
                  </div>
                </div>
                {!isBooleanFlag(flag) && (
                  <div className="detail-row">
                    <span className="detail-label">Current Value:</span>
                    <code className="flag-value">{getFlagValue(flag)}</code>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {featureFlags.length === 0 && (
        <div className="empty-state">
          <h3>No Feature Flags</h3>
          <p>No feature flags are currently configured.</p>
        </div>
      )}
    </div>
  );
};

const RuntimeTab = ({ loadedPlugins }) => {
  return (
    <div className="runtime-tab">
      <div className="runtime-info">
        <h3>Runtime Status</h3>
        <p>Currently loaded plugins and their runtime information.</p>
      </div>
      
      <div className="runtime-grid">
        {loadedPlugins.map(plugin => (
          <div key={plugin.name} className="runtime-card">
            <div className="runtime-header">
              <h4>{plugin.name}</h4>
              <span className="runtime-status loaded">Loaded</span>
            </div>
            <div className="runtime-body">
              <div className="runtime-detail">
                <span className="detail-label">Type:</span>
                <span className="detail-value">{plugin.type}</span>
              </div>
              <div className="runtime-detail">
                <span className="detail-label">Version:</span>
                <span className="detail-value">{plugin.version}</span>
              </div>
              <div className="runtime-detail">
                <span className="detail-label">Loaded At:</span>
                <span className="detail-value">
                  {new Date(plugin.loaded_at).toLocaleString()}
                </span>
              </div>
              <div className="runtime-detail">
                <span className="detail-label">Entry Point:</span>
                <code className="entry-point">{plugin.entry_point}</code>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {loadedPlugins.length === 0 && (
        <div className="empty-state">
          <h3>No Loaded Plugins</h3>
          <p>No plugins are currently loaded in the runtime.</p>
        </div>
      )}
    </div>
  );
};

export default Plugins;
import React, { useState, useEffect, useCallback } from 'react';
import moduleRegistryService from '../../services/moduleRegistryService';
import './ModuleManager.css';

const ModuleManager = ({ token }) => {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    category: 'all',
    search: ''
  });

  const loadModules = useCallback(async () => {
    try {
      setLoading(true);
      const moduleList = await moduleRegistryService.listModules(filters);
      setModules(moduleList);
      setError(null);
    } catch (err) {
      console.error('Failed to load modules:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadSystemStatus = useCallback(async () => {
    const status = moduleRegistryService.getSystemStatus();
    setSystemStatus(status);
  }, []);

  useEffect(() => {
    loadModules();
    loadSystemStatus();
  }, [loadModules, loadSystemStatus]);

  const handleStatusChange = async (moduleId, newStatus) => {
    try {
      await moduleRegistryService.updateModuleStatus(moduleId, newStatus);
      await loadModules();
      setSelectedModule(null);
    } catch (err) {
      console.error('Failed to update module status:', err);
      alert(`Failed to update module status: ${err.message}`);
    }
  };

  const handleLoadModule = async (moduleId) => {
    try {
      await moduleRegistryService.loadModule(moduleId);
      await loadSystemStatus();
      alert(`Module ${moduleId} loaded successfully`);
    } catch (err) {
      console.error('Failed to load module:', err);
      alert(`Failed to load module: ${err.message}`);
    }
  };

  const handleUnloadModule = async (moduleId) => {
    try {
      await moduleRegistryService.unloadModule(moduleId);
      await loadSystemStatus();
      alert(`Module ${moduleId} unloaded successfully`);
    } catch (err) {
      console.error('Failed to unload module:', err);
      alert(`Failed to unload module: ${err.message}`);
    }
  };

  const filteredModules = modules.filter(module => {
    if (filters.status !== 'all' && module.status !== filters.status) {
      return false;
    }
    if (filters.category !== 'all' && module.category !== filters.category) {
      return false;
    }
    if (filters.search && !module.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const getStatusColor = (status) => {
    const colors = {
      active: '#28a745',
      inactive: '#6c757d',
      error: '#dc3545',
      loading: '#ffc107'
    };
    return colors[status] || '#6c757d';
  };

  const getModuleCategories = () => {
    const categories = [...new Set(modules.map(m => m.category).filter(Boolean))];
    return categories;
  };

  if (loading && modules.length === 0) {
    return (
      <div className="module-manager loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading modules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-manager">
      <div className="module-manager-header">
        <div className="header-content">
          <h2>Module Manager</h2>
          <p>Manage micro-frontend modules and their lifecycle</p>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowRegistrationForm(true)}
            className="btn btn-primary"
          >
            Register Module
          </button>
          <button 
            onClick={loadModules}
            className="btn btn-secondary"
          >
            Refresh
          </button>
        </div>
      </div>

      {systemStatus && (
        <div className="system-status">
          <h3>System Status</h3>
          <div className="status-grid">
            <div className="status-item">
              <span className="status-label">Total Modules</span>
              <span className="status-value">{systemStatus.totalModules}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Loaded Modules</span>
              <span className="status-value">{systemStatus.loadedModules}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Cache Size</span>
              <span className="status-value">{systemStatus.cacheSize}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Event Listeners</span>
              <span className="status-value">{systemStatus.eventListeners}</span>
            </div>
          </div>
        </div>
      )}

      <div className="filters-section">
        <div className="filter-group">
          <label>Status:</label>
          <select 
            value={filters.status} 
            onChange={(e) => setFilters({...filters, status: e.target.value})}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="error">Error</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Category:</label>
          <select 
            value={filters.category} 
            onChange={(e) => setFilters({...filters, category: e.target.value})}
          >
            <option value="all">All Categories</option>
            {getModuleCategories().map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label>Search:</label>
          <input 
            type="text" 
            value={filters.search}
            onChange={(e) => setFilters({...filters, search: e.target.value})}
            placeholder="Search modules..."
          />
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
          <button onClick={loadModules} className="retry-btn">Retry</button>
        </div>
      )}

      <div className="modules-list">
        {filteredModules.length === 0 ? (
          <div className="empty-state">
            <p>No modules found matching the current filters.</p>
          </div>
        ) : (
          <div className="modules-grid">
            {filteredModules.map(module => (
              <div key={module.id} className="module-card">
                <div className="module-header">
                  <div className="module-title">
                    <h4>{module.name}</h4>
                    <span className="module-version">v{module.version}</span>
                  </div>
                  <div 
                    className="module-status"
                    style={{ backgroundColor: getStatusColor(module.status) }}
                  >
                    {module.status}
                  </div>
                </div>
                
                <div className="module-info">
                  <p><strong>ID:</strong> {module.id}</p>
                  <p><strong>Category:</strong> {module.category || 'General'}</p>
                  <p><strong>Entry Point:</strong> {module.entryPoint}</p>
                  {module.description && (
                    <p><strong>Description:</strong> {module.description}</p>
                  )}
                  {module.dependencies && module.dependencies.length > 0 && (
                    <p><strong>Dependencies:</strong> {module.dependencies.join(', ')}</p>
                  )}
                </div>
                
                <div className="module-actions">
                  <button 
                    onClick={() => setSelectedModule(module)}
                    className="btn btn-sm btn-info"
                  >
                    Details
                  </button>
                  
                  {module.status === 'active' ? (
                    <>
                      <button 
                        onClick={() => handleLoadModule(module.id)}
                        className="btn btn-sm btn-success"
                        disabled={moduleRegistryService.isModuleLoaded(module.id)}
                      >
                        {moduleRegistryService.isModuleLoaded(module.id) ? 'Loaded' : 'Load'}
                      </button>
                      
                      {moduleRegistryService.isModuleLoaded(module.id) && (
                        <button 
                          onClick={() => handleUnloadModule(module.id)}
                          className="btn btn-sm btn-warning"
                        >
                          Unload
                        </button>
                      )}
                      
                      <button 
                        onClick={() => handleStatusChange(module.id, 'inactive')}
                        className="btn btn-sm btn-secondary"
                      >
                        Disable
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => handleStatusChange(module.id, 'active')}
                      className="btn btn-sm btn-primary"
                    >
                      Enable
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedModule && (
        <ModuleDetailsModal 
          module={selectedModule} 
          onClose={() => setSelectedModule(null)}
          onUpdate={loadModules}
        />
      )}

      {showRegistrationForm && (
        <ModuleRegistrationForm 
          onClose={() => setShowRegistrationForm(false)}
          onSuccess={loadModules}
        />
      )}
    </div>
  );
};

const ModuleDetailsModal = ({ module, onClose, onUpdate }) => {
  const [config, setConfig] = useState(JSON.stringify(module.config || {}, null, 2));
  const [saving, setSaving] = useState(false);

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      const parsedConfig = JSON.parse(config);
      // Update module config via API
      console.log('Updating module config:', parsedConfig);
      await onUpdate();
      onClose();
    } catch (err) {
      alert('Invalid JSON configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Module Details: {module.name}</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-section">
            <h4>Basic Information</h4>
            <div className="detail-grid">
              <div><strong>ID:</strong> {module.id}</div>
              <div><strong>Name:</strong> {module.name}</div>
              <div><strong>Version:</strong> {module.version}</div>
              <div><strong>Status:</strong> {module.status}</div>
              <div><strong>Category:</strong> {module.category || 'General'}</div>
              <div><strong>Entry Point:</strong> {module.entryPoint}</div>
            </div>
          </div>
          
          {module.dependencies && (
            <div className="detail-section">
              <h4>Dependencies</h4>
              <ul>
                {module.dependencies.map(dep => (
                  <li key={dep}>{dep}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="detail-section">
            <h4>Configuration</h4>
            <textarea 
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              className="config-editor"
              rows="10"
            />
            <div className="config-actions">
              <button 
                onClick={handleSaveConfig}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? 'Saving...' : 'Save Config'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModuleRegistrationForm = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    version: '1.0.0',
    entryPoint: '',
    category: 'general',
    description: '',
    dependencies: '',
    config: '{}'
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      
      const moduleConfig = {
        ...formData,
        dependencies: formData.dependencies.split(',').map(d => d.trim()).filter(Boolean),
        config: JSON.parse(formData.config)
      };
      
      await moduleRegistryService.registerModule(moduleConfig);
      await onSuccess();
      onClose();
    } catch (err) {
      alert(`Registration failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Register New Module</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Module ID *</label>
            <input 
              type="text" 
              value={formData.id}
              onChange={(e) => setFormData({...formData, id: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Name *</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Version</label>
              <input 
                type="text" 
                value={formData.version}
                onChange={(e) => setFormData({...formData, version: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
              >
                <option value="general">General</option>
                <option value="widget">Widget</option>
                <option value="analytics">Analytics</option>
                <option value="admin">Admin</option>
                <option value="integration">Integration</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Entry Point *</label>
            <input 
              type="text" 
              value={formData.entryPoint}
              onChange={(e) => setFormData({...formData, entryPoint: e.target.value})}
              placeholder="./modules/MyModule.js or https://cdn.example.com/module.js"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              rows="3"
            />
          </div>
          
          <div className="form-group">
            <label>Dependencies (comma-separated)</label>
            <input 
              type="text" 
              value={formData.dependencies}
              onChange={(e) => setFormData({...formData, dependencies: e.target.value})}
              placeholder="module1, module2, module3"
            />
          </div>
          
          <div className="form-group">
            <label>Configuration (JSON)</label>
            <textarea 
              value={formData.config}
              onChange={(e) => setFormData({...formData, config: e.target.value})}
              rows="4"
            />
          </div>
          
          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Registering...' : 'Register Module'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModuleManager;
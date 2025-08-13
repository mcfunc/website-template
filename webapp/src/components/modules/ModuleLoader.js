import React, { useState, useEffect, useCallback, useMemo } from 'react';
import moduleRegistryService from '../../services/moduleRegistryService';
import './ModuleLoader.css';

const ModuleLoader = ({ 
  moduleId, 
  fallback = null, 
  onLoad = null, 
  onError = null,
  config = {},
  className = '',
  loadingIndicator = true
}) => {
  const [module, setModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  const loadModule = useCallback(async () => {
    if (!moduleId) {
      setError(new Error('Module ID is required'));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check if module is already loaded in the registry
      const loadedModule = moduleRegistryService.getLoadedModule(moduleId);
      if (loadedModule) {
        setModule(loadedModule);
        setLoading(false);
        if (onLoad) {
          onLoad(loadedModule);
        }
        return;
      }

      // Load the module
      const moduleInstance = await moduleRegistryService.loadModule(moduleId);
      
      // Apply additional config if provided
      if (config && Object.keys(config).length > 0 && moduleInstance.updateConfig) {
        await moduleInstance.updateConfig(config);
      }

      setModule(moduleInstance);
      setRetryCount(0);
      
      if (onLoad) {
        onLoad(moduleInstance);
      }
    } catch (err) {
      console.error(`Failed to load module ${moduleId}:`, err);
      setError(err);
      
      // Retry logic
      if (retryCount < maxRetries) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          loadModule();
        }, retryDelay * (retryCount + 1));
      }
      
      if (onError) {
        onError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [moduleId, config, onLoad, onError, retryCount, maxRetries]);

  const unloadModule = useCallback(async () => {
    if (module) {
      try {
        await moduleRegistryService.unloadModule(moduleId);
        setModule(null);
      } catch (err) {
        console.error(`Failed to unload module ${moduleId}:`, err);
      }
    }
  }, [module, moduleId]);

  const retryLoad = useCallback(() => {
    setRetryCount(0);
    loadModule();
  }, [loadModule]);

  useEffect(() => {
    loadModule();

    // Cleanup on unmount
    return () => {
      if (module && module.cleanup) {
        module.cleanup();
      }
    };
  }, [moduleId]);

  // Event listeners for module registry events
  useEffect(() => {
    const handleModuleUnloaded = ({ moduleId: unloadedModuleId }) => {
      if (unloadedModuleId === moduleId) {
        setModule(null);
        setError(new Error('Module was unloaded externally'));
      }
    };

    const handleModuleError = ({ moduleId: errorModuleId, error: moduleError }) => {
      if (errorModuleId === moduleId) {
        setError(moduleError);
        setModule(null);
      }
    };

    moduleRegistryService.on('moduleUnloaded', handleModuleUnloaded);
    moduleRegistryService.on('moduleLoadError', handleModuleError);

    return () => {
      moduleRegistryService.off('moduleUnloaded', handleModuleUnloaded);
      moduleRegistryService.off('moduleLoadError', handleModuleError);
    };
  }, [moduleId]);

  const moduleComponent = useMemo(() => {
    if (!module) {
      return null;
    }

    try {
      // Different ways modules can export their components
      if (React.isValidElement(module)) {
        return module;
      }
      
      if (module.Component) {
        const Component = module.Component;
        return <Component {...config} />;
      }
      
      if (module.render && typeof module.render === 'function') {
        return module.render(config);
      }
      
      if (typeof module === 'function') {
        return module(config);
      }
      
      // If module has a default export that's a React component
      if (module.default && typeof module.default === 'function') {
        const Component = module.default;
        return <Component {...config} />;
      }

      console.warn(`Module ${moduleId} does not export a valid React component`);
      return (
        <div className="module-warning">
          Module loaded but no valid component found
        </div>
      );
    } catch (renderError) {
      console.error(`Error rendering module ${moduleId}:`, renderError);
      setError(renderError);
      return null;
    }
  }, [module, config, moduleId]);

  if (loading && loadingIndicator) {
    return (
      <div className={`module-loader loading ${className}`}>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading module {moduleId}...</p>
          {retryCount > 0 && (
            <small>Retry attempt {retryCount}/{maxRetries}</small>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = error.message || 'Unknown error occurred';
    
    return (
      <div className={`module-loader error ${className}`}>
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <h4>Failed to Load Module</h4>
            <p>Module ID: <code>{moduleId}</code></p>
            <p className="error-message">{errorMessage}</p>
            {retryCount >= maxRetries ? (
              <div className="error-actions">
                <button onClick={retryLoad} className="retry-btn">
                  Try Again
                </button>
                {fallback && (
                  <button 
                    onClick={() => {
                      setError(null);
                      setModule({ render: () => fallback });
                    }}
                    className="fallback-btn"
                  >
                    Use Fallback
                  </button>
                )}
              </div>
            ) : (
              <p className="retry-info">Retrying in {retryDelay * (retryCount + 1) / 1000}s...</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!module) {
    if (fallback) {
      return (
        <div className={`module-loader fallback ${className}`}>
          {fallback}
        </div>
      );
    }
    
    return (
      <div className={`module-loader empty ${className}`}>
        <div className="empty-state">
          <p>No module content available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`module-loader loaded ${className}`}>
      <div className="module-content">
        {moduleComponent}
      </div>
      {process.env.NODE_ENV === 'development' && (
        <div className="module-debug-info">
          <details>
            <summary>Module Debug Info</summary>
            <div className="debug-content">
              <p><strong>Module ID:</strong> {moduleId}</p>
              <p><strong>Status:</strong> Loaded</p>
              <p><strong>Config:</strong> {JSON.stringify(config, null, 2)}</p>
              {module.__moduleInfo && (
                <div>
                  <p><strong>Version:</strong> {module.__moduleInfo.version}</p>
                  <p><strong>Dependencies:</strong> {module.__moduleInfo.dependencies?.join(', ') || 'None'}</p>
                </div>
              )}
              <button onClick={unloadModule} className="debug-unload-btn">
                Unload Module
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

export default ModuleLoader;
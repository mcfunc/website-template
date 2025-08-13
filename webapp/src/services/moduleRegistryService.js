import axios from 'axios';

class ModuleRegistryService {
  constructor() {
    this.moduleCache = new Map();
    this.loadedModules = new Map();
    this.eventListeners = new Map();
  }

  /**
   * Register a new micro-frontend module
   */
  async registerModule(moduleConfig) {
    try {
      const response = await axios.post('/api/modules/register', moduleConfig);
      
      const moduleInfo = {
        id: moduleConfig.id,
        name: moduleConfig.name,
        version: moduleConfig.version,
        entryPoint: moduleConfig.entryPoint,
        dependencies: moduleConfig.dependencies || [],
        permissions: moduleConfig.permissions || [],
        config: moduleConfig.config || {},
        status: 'registered',
        registeredAt: new Date().toISOString()
      };

      this.moduleCache.set(moduleConfig.id, moduleInfo);
      this.emit('moduleRegistered', moduleInfo);
      
      return response.data;
    } catch (error) {
      console.error('Module registration failed:', error);
      throw new Error(`Failed to register module ${moduleConfig.id}: ${error.message}`);
    }
  }

  /**
   * Load a micro-frontend module dynamically
   */
  async loadModule(moduleId) {
    try {
      if (this.loadedModules.has(moduleId)) {
        return this.loadedModules.get(moduleId);
      }

      // Get module info from registry
      const moduleInfo = await this.getModuleInfo(moduleId);
      if (!moduleInfo) {
        throw new Error(`Module ${moduleId} not found in registry`);
      }

      // Check if module is enabled
      if (moduleInfo.status !== 'active') {
        throw new Error(`Module ${moduleId} is not active (status: ${moduleInfo.status})`);
      }

      // Load dependencies first
      await this.loadDependencies(moduleInfo.dependencies);

      // Dynamic import of the module
      const moduleExport = await this.dynamicImport(moduleInfo.entryPoint);
      
      // Initialize the module
      const initializedModule = await this.initializeModule(moduleExport, moduleInfo);
      
      this.loadedModules.set(moduleId, initializedModule);
      this.emit('moduleLoaded', { moduleId, module: initializedModule });
      
      return initializedModule;
    } catch (error) {
      console.error(`Failed to load module ${moduleId}:`, error);
      this.emit('moduleLoadError', { moduleId, error });
      throw error;
    }
  }

  /**
   * Unload a module and clean up resources
   */
  async unloadModule(moduleId) {
    try {
      const module = this.loadedModules.get(moduleId);
      if (!module) {
        return false;
      }

      // Call module cleanup if available
      if (module.cleanup && typeof module.cleanup === 'function') {
        await module.cleanup();
      }

      this.loadedModules.delete(moduleId);
      this.emit('moduleUnloaded', { moduleId });
      
      return true;
    } catch (error) {
      console.error(`Failed to unload module ${moduleId}:`, error);
      throw error;
    }
  }

  /**
   * Get module information from registry
   */
  async getModuleInfo(moduleId) {
    try {
      if (this.moduleCache.has(moduleId)) {
        return this.moduleCache.get(moduleId);
      }

      const response = await axios.get(`/api/modules/${moduleId}`);
      const moduleInfo = response.data;
      
      this.moduleCache.set(moduleId, moduleInfo);
      return moduleInfo;
    } catch (error) {
      console.error(`Failed to get module info for ${moduleId}:`, error);
      return null;
    }
  }

  /**
   * List all available modules
   */
  async listModules(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);

      const response = await axios.get(`/api/modules?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Failed to list modules:', error);
      return [];
    }
  }

  /**
   * Update module status (enable/disable)
   */
  async updateModuleStatus(moduleId, status) {
    try {
      const response = await axios.patch(`/api/modules/${moduleId}/status`, { status });
      
      // Update cache
      const moduleInfo = this.moduleCache.get(moduleId);
      if (moduleInfo) {
        moduleInfo.status = status;
        this.moduleCache.set(moduleId, moduleInfo);
      }

      this.emit('moduleStatusChanged', { moduleId, status });
      return response.data;
    } catch (error) {
      console.error(`Failed to update module status for ${moduleId}:`, error);
      throw error;
    }
  }

  /**
   * Get loaded module instance
   */
  getLoadedModule(moduleId) {
    return this.loadedModules.get(moduleId);
  }

  /**
   * Check if module is loaded
   */
  isModuleLoaded(moduleId) {
    return this.loadedModules.has(moduleId);
  }

  /**
   * Load module dependencies
   */
  async loadDependencies(dependencies) {
    if (!dependencies || dependencies.length === 0) {
      return;
    }

    const loadPromises = dependencies.map(async (dep) => {
      if (!this.isModuleLoaded(dep)) {
        await this.loadModule(dep);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Dynamic import with error handling
   */
  async dynamicImport(entryPoint) {
    try {
      // Support for different entry point formats
      if (entryPoint.startsWith('http')) {
        // External module
        return await this.loadExternalModule(entryPoint);
      } else {
        // Local module
        const moduleExport = await import(entryPoint);
        return moduleExport.default || moduleExport;
      }
    } catch (error) {
      console.error(`Failed to import module from ${entryPoint}:`, error);
      throw new Error(`Module import failed: ${error.message}`);
    }
  }

  /**
   * Load external module from URL
   */
  async loadExternalModule(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.onload = () => {
        // Assume the module exports itself to a global variable
        const moduleName = url.split('/').pop().split('.')[0];
        const moduleExport = window[moduleName];
        if (moduleExport) {
          resolve(moduleExport);
        } else {
          reject(new Error(`Module ${moduleName} not found in global scope`));
        }
      };
      script.onerror = () => reject(new Error(`Failed to load external module from ${url}`));
      script.src = url;
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize module with proper context
   */
  async initializeModule(moduleExport, moduleInfo) {
    try {
      const context = {
        moduleId: moduleInfo.id,
        config: moduleInfo.config,
        permissions: moduleInfo.permissions,
        dependencies: this.getDependencyInstances(moduleInfo.dependencies),
        emit: (event, data) => this.emit(`module:${moduleInfo.id}:${event}`, data),
        on: (event, handler) => this.on(`module:${moduleInfo.id}:${event}`, handler)
      };

      let initializedModule;

      if (typeof moduleExport === 'function') {
        // Module is a factory function
        initializedModule = await moduleExport(context);
      } else if (moduleExport && typeof moduleExport.init === 'function') {
        // Module has an init method
        await moduleExport.init(context);
        initializedModule = moduleExport;
      } else {
        // Module is a plain object
        initializedModule = moduleExport;
      }

      return {
        ...initializedModule,
        __moduleInfo: moduleInfo,
        __context: context
      };
    } catch (error) {
      console.error(`Failed to initialize module ${moduleInfo.id}:`, error);
      throw error;
    }
  }

  /**
   * Get dependency module instances
   */
  getDependencyInstances(dependencies) {
    const instances = {};
    if (dependencies) {
      dependencies.forEach(dep => {
        const instance = this.getLoadedModule(dep);
        if (instance) {
          instances[dep] = instance;
        }
      });
    }
    return instances;
  }

  /**
   * Event system for module communication
   */
  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  off(event, handler) {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Clear module cache
   */
  clearCache() {
    this.moduleCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Get system health status
   */
  getSystemStatus() {
    return {
      totalModules: this.moduleCache.size,
      loadedModules: this.loadedModules.size,
      cacheSize: this.moduleCache.size,
      eventListeners: Array.from(this.eventListeners.keys()).length
    };
  }
}

// Singleton instance
const moduleRegistryService = new ModuleRegistryService();

export default moduleRegistryService;
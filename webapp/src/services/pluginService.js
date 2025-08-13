const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const auditLogger = require('./auditLogger');

class PluginService {
  constructor() {
    // Database connection
    const poolConfig = process.env.DATABASE_URL 
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'sitetemplate',
          user: process.env.POSTGRES_USER || 'admin',
          password: process.env.POSTGRES_PASSWORD || 'password'
        };
    
    this.pool = new Pool({
      ...poolConfig,
      ssl: false,
    });

    // Plugin system state
    this.loadedPlugins = new Map();
    this.pluginCache = new Map();
    this.featureFlagCache = new Map();
    this.cacheTimeout = 2 * 60 * 1000; // 2 minutes for shorter feature flag TTL

    // Plugin directory paths
    this.pluginPaths = {
      components: path.join(__dirname, '../plugins/components'),
      services: path.join(__dirname, '../plugins/services'),
      middleware: path.join(__dirname, '../plugins/middleware'),
      widgets: path.join(__dirname, '../plugins/widgets')
    };
  }

  // Plugin Registry Management

  async getPlugins(options = {}) {
    const { enabled, pluginType, limit = 50, offset = 0 } = options;
    const client = await this.pool.connect();
    
    try {
      let query = 'SELECT * FROM plugins.registry';
      const params = [];
      const conditions = [];

      if (enabled !== undefined) {
        conditions.push(`enabled = $${params.length + 1}`);
        params.push(enabled);
      }

      if (pluginType) {
        conditions.push(`plugin_type = $${params.length + 1}`);
        params.push(pluginType);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await client.query(query, params);
      return {
        success: true,
        data: result.rows,
        total: result.rows.length
      };
    } catch (error) {
      console.error('Get plugins error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getPlugin(nameOrId) {
    const cacheKey = `plugin_${nameOrId}`;
    
    // Check cache
    if (this.pluginCache.has(cacheKey)) {
      const cached = this.pluginCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return { success: true, data: cached.data };
      }
    }

    const client = await this.pool.connect();
    
    try {
      const isNumeric = !isNaN(nameOrId);
      const query = isNumeric 
        ? 'SELECT * FROM plugins.registry WHERE id = $1'
        : 'SELECT * FROM plugins.registry WHERE name = $1';
      
      const result = await client.query(query, [nameOrId]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Plugin not found'
        };
      }

      const plugin = result.rows[0];
      
      // Cache the result
      this.pluginCache.set(cacheKey, {
        data: plugin,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: plugin
      };
    } catch (error) {
      console.error('Get plugin error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async enablePlugin(pluginId, userId = null) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get plugin info
      const pluginResult = await client.query('SELECT * FROM plugins.registry WHERE id = $1', [pluginId]);
      if (pluginResult.rows.length === 0) {
        throw new Error('Plugin not found');
      }

      const plugin = pluginResult.rows[0];

      // Check dependencies
      const dependencyCheck = await this.checkDependencies(plugin.dependencies);
      if (!dependencyCheck.success) {
        throw new Error(`Dependency check failed: ${dependencyCheck.error}`);
      }

      // Update plugin status
      await client.query(
        'UPDATE plugins.registry SET enabled = true, updated_at = NOW() WHERE id = $1',
        [pluginId]
      );

      // Load the plugin
      const loadResult = await this.loadPlugin(plugin);
      if (!loadResult.success) {
        throw new Error(`Failed to load plugin: ${loadResult.error}`);
      }

      // Log the action
      if (userId) {
        await auditLogger.log({
          resource_type: 'plugin',
          resource_id: pluginId,
          action: 'enabled',
          user_id: userId,
          details: { plugin_name: plugin.name, plugin_type: plugin.plugin_type }
        });
      }

      await client.query('COMMIT');

      // Clear cache
      this.pluginCache.clear();

      return {
        success: true,
        data: { plugin_id: pluginId, status: 'enabled', loaded: loadResult.success }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Enable plugin error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async disablePlugin(pluginId, userId = null) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get plugin info
      const pluginResult = await client.query('SELECT * FROM plugins.registry WHERE id = $1', [pluginId]);
      if (pluginResult.rows.length === 0) {
        throw new Error('Plugin not found');
      }

      const plugin = pluginResult.rows[0];

      // Update plugin status
      await client.query(
        'UPDATE plugins.registry SET enabled = false, updated_at = NOW() WHERE id = $1',
        [pluginId]
      );

      // Unload the plugin
      this.unloadPlugin(plugin.name);

      // Log the action
      if (userId) {
        await auditLogger.log({
          resource_type: 'plugin',
          resource_id: pluginId,
          action: 'disabled',
          user_id: userId,
          details: { plugin_name: plugin.name, plugin_type: plugin.plugin_type }
        });
      }

      await client.query('COMMIT');

      // Clear cache
      this.pluginCache.clear();

      return {
        success: true,
        data: { plugin_id: pluginId, status: 'disabled' }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Disable plugin error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Plugin Loading and Management

  async loadPlugin(plugin) {
    try {
      if (this.loadedPlugins.has(plugin.name)) {
        return { success: true, message: 'Plugin already loaded' };
      }

      // Determine plugin path
      const pluginPath = this.getPluginPath(plugin);
      
      // Check if plugin file exists
      try {
        await fs.access(pluginPath);
      } catch (error) {
        return {
          success: false,
          error: `Plugin file not found: ${pluginPath}`
        };
      }

      // For now, we'll simulate plugin loading
      // In a real implementation, this would dynamically require the module
      const pluginInfo = {
        name: plugin.name,
        type: plugin.plugin_type,
        version: plugin.version,
        loaded_at: new Date(),
        entry_point: plugin.entry_point,
        config: {}
      };

      this.loadedPlugins.set(plugin.name, pluginInfo);

      console.log(`Plugin ${plugin.name} loaded successfully`);
      
      return {
        success: true,
        data: pluginInfo
      };
    } catch (error) {
      console.error(`Load plugin error for ${plugin.name}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  unloadPlugin(pluginName) {
    if (this.loadedPlugins.has(pluginName)) {
      this.loadedPlugins.delete(pluginName);
      console.log(`Plugin ${pluginName} unloaded`);
      return true;
    }
    return false;
  }

  getPluginPath(plugin) {
    const baseDir = this.pluginPaths[plugin.plugin_type + 's'] || this.pluginPaths.components;
    return path.join(baseDir, plugin.entry_point);
  }

  async checkDependencies(dependencies) {
    try {
      const deps = Array.isArray(dependencies) ? dependencies : JSON.parse(dependencies || '[]');
      
      // For now, we'll do a basic check
      // In a real implementation, this would check if dependencies are available
      const unavailableDeps = [];
      
      for (const dep of deps) {
        // Check if dependency is a loaded plugin or system module
        if (!this.loadedPlugins.has(dep) && !this.isSystemModule(dep)) {
          unavailableDeps.push(dep);
        }
      }

      if (unavailableDeps.length > 0) {
        return {
          success: false,
          error: `Missing dependencies: ${unavailableDeps.join(', ')}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Dependency check error: ${error.message}`
      };
    }
  }

  isSystemModule(moduleName) {
    const systemModules = ['react', 'react-dom', 'axios', 'lodash', 'moment'];
    return systemModules.includes(moduleName);
  }

  // Feature Flags Management

  async getFeatureFlags(options = {}) {
    const { active = true, environment, limit = 50, offset = 0 } = options;
    const client = await this.pool.connect();
    
    try {
      let query = 'SELECT * FROM plugins.feature_flags';
      const params = [];
      const conditions = [];

      if (active !== null) {
        conditions.push(`active = $${params.length + 1}`);
        params.push(active);
      }

      if (environment) {
        conditions.push(`environment = $${params.length + 1}`);
        params.push(environment);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await client.query(query, params);
      return {
        success: true,
        data: result.rows,
        total: result.rows.length
      };
    } catch (error) {
      console.error('Get feature flags error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getFeatureFlag(flagName, userId = null) {
    const cacheKey = `flag_${flagName}_${userId || 'global'}`;
    
    // Check cache
    if (this.featureFlagCache.has(cacheKey)) {
      const cached = this.featureFlagCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return { success: true, data: cached.data };
      }
    }

    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT plugins.get_feature_flag_value($1, $2) as flag_value',
        [flagName, userId]
      );

      const flagData = result.rows[0].flag_value;
      
      // Cache the result
      this.featureFlagCache.set(cacheKey, {
        data: flagData,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: flagData
      };
    } catch (error) {
      console.error('Get feature flag error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async setFeatureFlagValue(flagName, value, userId = null, reason = null) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      if (userId) {
        // Set user-specific override
        await client.query(`
          INSERT INTO plugins.user_feature_flags (feature_flag_id, user_id, override_value, reason)
          VALUES ((SELECT id FROM plugins.feature_flags WHERE name = $1), $2, $3, $4)
          ON CONFLICT (feature_flag_id, user_id)
          DO UPDATE SET 
            override_value = EXCLUDED.override_value,
            reason = EXCLUDED.reason,
            updated_at = NOW()
        `, [flagName, userId, JSON.stringify(value), reason]);
      } else {
        // Update global flag value
        await client.query(`
          UPDATE plugins.feature_flags 
          SET current_value = $2, updated_at = NOW()
          WHERE name = $1
        `, [flagName, JSON.stringify(value)]);
      }

      // Log the change
      await auditLogger.log({
        resource_type: 'feature_flag',
        resource_id: flagName,
        action: userId ? 'user_override' : 'updated',
        user_id: userId,
        details: { flag_name: flagName, new_value: value, reason }
      });

      await client.query('COMMIT');

      // Clear cache
      this.featureFlagCache.clear();

      return {
        success: true,
        data: { flag_name: flagName, value, user_id: userId }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Set feature flag error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Plugin Configuration Management

  async getPluginConfiguration(pluginId, userId = null, brandProfileId = null) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT * FROM plugins.configurations
        WHERE plugin_id = $1 AND user_id = $2 AND brand_profile_id = $3
      `;
      
      const result = await client.query(query, [pluginId, userId, brandProfileId]);
      
      if (result.rows.length === 0) {
        return {
          success: true,
          data: { config_data: {}, enabled: true } // Default configuration
        };
      }

      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      console.error('Get plugin configuration error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async setPluginConfiguration(pluginId, configData, userId = null, brandProfileId = null) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO plugins.configurations (plugin_id, user_id, brand_profile_id, config_data)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (plugin_id, user_id, brand_profile_id)
        DO UPDATE SET 
          config_data = EXCLUDED.config_data,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await client.query(query, [pluginId, userId, brandProfileId, JSON.stringify(configData)]);

      // Log the change
      await auditLogger.log({
        resource_type: 'plugin_config',
        resource_id: result.rows[0].id,
        action: 'updated',
        user_id: userId,
        details: { plugin_id: pluginId, brand_profile_id: brandProfileId }
      });

      await client.query('COMMIT');

      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Set plugin configuration error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Utility Methods

  async getLoadedPlugins() {
    return {
      success: true,
      data: Array.from(this.loadedPlugins.values())
    };
  }

  async initializeEnabledPlugins() {
    try {
      const pluginsResult = await this.getPlugins({ enabled: true });
      if (!pluginsResult.success) {
        return pluginsResult;
      }

      const loadResults = [];
      for (const plugin of pluginsResult.data) {
        const loadResult = await this.loadPlugin(plugin);
        loadResults.push({
          plugin: plugin.name,
          success: loadResult.success,
          error: loadResult.error
        });
      }

      return {
        success: true,
        data: loadResults
      };
    } catch (error) {
      console.error('Initialize enabled plugins error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cache Management

  clearCache() {
    this.pluginCache.clear();
    this.featureFlagCache.clear();
  }

  // Health Check

  async healthCheck() {
    const client = await this.pool.connect();
    
    try {
      await client.query('SELECT 1 FROM plugins.registry LIMIT 1');
      await client.query('SELECT 1 FROM plugins.feature_flags LIMIT 1');
      
      return {
        status: 'healthy',
        loaded_plugins: this.loadedPlugins.size,
        cache_size: {
          plugins: this.pluginCache.size,
          feature_flags: this.featureFlagCache.size
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Cleanup method
  async close() {
    await this.pool.end();
    this.clearCache();
    this.loadedPlugins.clear();
  }
}

module.exports = new PluginService();
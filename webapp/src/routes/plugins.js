const express = require('express');
const router = express.Router();
const pluginService = require('../services/pluginService');
const { authenticateToken } = require('../middleware/auth');

// Get all plugins
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { enabled, pluginType, limit, offset } = req.query;
    const result = await pluginService.getPlugins({
      enabled: enabled !== undefined ? enabled === 'true' : undefined,
      pluginType,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get plugins error:', error);
    res.status(500).json({ error: 'Failed to get plugins' });
  }
});

// Get specific plugin
router.get('/:nameOrId', authenticateToken, async (req, res) => {
  try {
    const { nameOrId } = req.params;
    const result = await pluginService.getPlugin(nameOrId);

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get plugin error:', error);
    res.status(500).json({ error: 'Failed to get plugin' });
  }
});

// Enable plugin (admin only)
router.post('/:pluginId/enable', authenticateToken, async (req, res) => {
  try {
    // Check admin permissions
    if (!req.user.permissions.includes('admin:plugins')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { pluginId } = req.params;
    const result = await pluginService.enablePlugin(parseInt(pluginId), req.user.id);

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Enable plugin error:', error);
    res.status(500).json({ error: 'Failed to enable plugin' });
  }
});

// Disable plugin (admin only)
router.post('/:pluginId/disable', authenticateToken, async (req, res) => {
  try {
    // Check admin permissions
    if (!req.user.permissions.includes('admin:plugins')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { pluginId } = req.params;
    const result = await pluginService.disablePlugin(parseInt(pluginId), req.user.id);

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Disable plugin error:', error);
    res.status(500).json({ error: 'Failed to disable plugin' });
  }
});

// Get plugin configuration
router.get('/:pluginId/config', authenticateToken, async (req, res) => {
  try {
    const { pluginId } = req.params;
    const { brandProfileId } = req.query;
    
    const result = await pluginService.getPluginConfiguration(
      parseInt(pluginId),
      req.user.id,
      brandProfileId ? parseInt(brandProfileId) : null
    );

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get plugin configuration error:', error);
    res.status(500).json({ error: 'Failed to get plugin configuration' });
  }
});

// Set plugin configuration
router.post('/:pluginId/config', authenticateToken, async (req, res) => {
  try {
    const { pluginId } = req.params;
    const { configData, brandProfileId } = req.body;
    
    if (!configData) {
      return res.status(400).json({ error: 'Configuration data is required' });
    }

    const result = await pluginService.setPluginConfiguration(
      parseInt(pluginId),
      configData,
      req.user.id,
      brandProfileId
    );

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Set plugin configuration error:', error);
    res.status(500).json({ error: 'Failed to set plugin configuration' });
  }
});

// Get loaded plugins
router.get('/runtime/loaded', authenticateToken, async (req, res) => {
  try {
    const result = await pluginService.getLoadedPlugins();
    res.json(result.data);
  } catch (error) {
    console.error('Get loaded plugins error:', error);
    res.status(500).json({ error: 'Failed to get loaded plugins' });
  }
});

// Feature Flags endpoints

// Get all feature flags
router.get('/features/flags', authenticateToken, async (req, res) => {
  try {
    const { active, environment, limit, offset } = req.query;
    const result = await pluginService.getFeatureFlags({
      active: active !== undefined ? active === 'true' : true,
      environment,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get feature flags error:', error);
    res.status(500).json({ error: 'Failed to get feature flags' });
  }
});

// Get specific feature flag value
router.get('/features/flags/:flagName', authenticateToken, async (req, res) => {
  try {
    const { flagName } = req.params;
    const { userId } = req.query;
    
    const result = await pluginService.getFeatureFlag(
      flagName, 
      userId || req.user.id
    );

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get feature flag error:', error);
    res.status(500).json({ error: 'Failed to get feature flag' });
  }
});

// Set feature flag value (admin only)
router.post('/features/flags/:flagName', authenticateToken, async (req, res) => {
  try {
    // Check admin permissions
    if (!req.user.permissions.includes('admin:features')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { flagName } = req.params;
    const { value, userId, reason } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const result = await pluginService.setFeatureFlagValue(
      flagName,
      value,
      userId,
      reason
    );

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Set feature flag error:', error);
    res.status(500).json({ error: 'Failed to set feature flag' });
  }
});

// Get feature flags for current user (public endpoint for UI)
router.get('/features/user-flags', authenticateToken, async (req, res) => {
  try {
    // Get common feature flags that affect UI
    const flagNames = [
      'enable_dark_mode',
      'enable_plugin_system',
      'enable_custom_themes',
      'enable_theme_preview',
      'enable_advanced_theming'
    ];

    const flags = {};
    
    for (const flagName of flagNames) {
      const result = await pluginService.getFeatureFlag(flagName, req.user.id);
      if (result.success) {
        flags[flagName] = result.data;
      }
    }

    res.json(flags);
  } catch (error) {
    console.error('Get user feature flags error:', error);
    res.status(500).json({ error: 'Failed to get user feature flags' });
  }
});

// Plugin system health check
router.get('/health', async (req, res) => {
  try {
    const health = await pluginService.healthCheck();
    res.json(health);
  } catch (error) {
    console.error('Plugin health check error:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

module.exports = router;
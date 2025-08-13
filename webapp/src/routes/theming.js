const express = require('express');
const router = express.Router();
const themingService = require('../services/themingService');
const { authenticateToken } = require('../middleware/auth');

// Get all brand profiles
router.get('/brand-profiles', authenticateToken, async (req, res) => {
  try {
    const { active, limit, offset } = req.query;
    const result = await themingService.getBrandProfiles({
      active: active !== undefined ? active === 'true' : true,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get brand profiles error:', error);
    res.status(500).json({ error: 'Failed to get brand profiles' });
  }
});

// Get specific brand profile
router.get('/brand-profiles/:nameOrId', authenticateToken, async (req, res) => {
  try {
    const { nameOrId } = req.params;
    const result = await themingService.getBrandProfile(nameOrId);

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get brand profile error:', error);
    res.status(500).json({ error: 'Failed to get brand profile' });
  }
});

// Create new brand profile (admin only)
router.post('/brand-profiles', authenticateToken, async (req, res) => {
  try {
    // Check admin permissions
    if (!req.user.permissions.includes('admin:themes')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const result = await themingService.createBrandProfile(req.body, req.user.id);

    if (result.success) {
      res.status(201).json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Create brand profile error:', error);
    res.status(500).json({ error: 'Failed to create brand profile' });
  }
});

// Get all themes
router.get('/themes', authenticateToken, async (req, res) => {
  try {
    const { brandProfileId, active, limit, offset } = req.query;
    const result = await themingService.getThemes({
      brandProfileId: brandProfileId ? parseInt(brandProfileId) : undefined,
      active: active !== undefined ? active === 'true' : true,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get themes error:', error);
    res.status(500).json({ error: 'Failed to get themes' });
  }
});

// Get specific theme
router.get('/themes/:nameOrId', authenticateToken, async (req, res) => {
  try {
    const { nameOrId } = req.params;
    const result = await themingService.getTheme(nameOrId);

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get theme error:', error);
    res.status(500).json({ error: 'Failed to get theme' });
  }
});

// Get user's current theme
router.get('/user/theme', authenticateToken, async (req, res) => {
  try {
    const { brandProfile = 'default' } = req.query;
    const result = await themingService.getUserTheme(req.user.id, brandProfile);

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get user theme error:', error);
    res.status(500).json({ error: 'Failed to get user theme' });
  }
});

// Set user's theme preference
router.post('/user/theme', authenticateToken, async (req, res) => {
  try {
    const { themeId, customOverrides = {} } = req.body;
    
    if (!themeId) {
      return res.status(400).json({ error: 'Theme ID is required' });
    }

    const result = await themingService.setUserTheme(req.user.id, themeId, customOverrides);

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Set user theme error:', error);
    res.status(500).json({ error: 'Failed to set user theme' });
  }
});

// Switch theme (includes CSS generation)
router.post('/user/switch-theme', authenticateToken, async (req, res) => {
  try {
    const { themeName, brandProfile = 'default' } = req.body;
    
    if (!themeName) {
      return res.status(400).json({ error: 'Theme name is required' });
    }

    const result = await themingService.switchTheme(req.user.id, themeName, brandProfile);

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Switch theme error:', error);
    res.status(500).json({ error: 'Failed to switch theme' });
  }
});

// Generate theme CSS
router.post('/generate-css', authenticateToken, async (req, res) => {
  try {
    const { brandProfile = 'default' } = req.body;
    
    // Get user's theme configuration
    const themeResult = await themingService.getUserTheme(req.user.id, brandProfile);
    if (!themeResult.success) {
      return res.status(400).json({ error: themeResult.error });
    }

    // Generate CSS
    const cssResult = await themingService.generateThemeCSS(themeResult.data);
    if (!cssResult.success) {
      return res.status(400).json({ error: cssResult.error });
    }

    res.setHeader('Content-Type', 'text/css');
    res.send(cssResult.css);
  } catch (error) {
    console.error('Generate CSS error:', error);
    res.status(500).json({ error: 'Failed to generate CSS' });
  }
});

// Get navigation menu
router.get('/navigation/:menuType', async (req, res) => {
  try {
    const { menuType } = req.params;
    const { brandProfile = 'default' } = req.query;
    
    // Get user permissions if authenticated
    let userPermissions = [];
    if (req.user) {
      userPermissions = req.user.permissions || [];
    }

    // This would typically use a dedicated navigation service
    // For now, we'll create a simple response
    const navigationData = {
      main: {
        menu_items: [
          { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', permissions: ['read:dashboard'] },
          { label: 'API Integration', path: '/api', icon: 'api', permissions: ['read:api'] },
          { label: 'Themes', path: '/themes', icon: 'palette', permissions: ['read:themes'] },
          { label: 'Plugins', path: '/plugins', icon: 'extension', permissions: ['read:plugins'] },
          { label: 'Settings', path: '/settings', icon: 'settings', permissions: ['read:settings'] }
        ]
      },
      sidebar: {
        menu_items: [
          { label: 'User Management', path: '/admin/users', icon: 'users', permissions: ['admin:users'] },
          { label: 'System Settings', path: '/admin/system', icon: 'system', permissions: ['admin:system'] },
          { label: 'Feature Flags', path: '/admin/features', icon: 'flag', permissions: ['admin:features'] },
          { label: 'Plugin Management', path: '/admin/plugins', icon: 'extension', permissions: ['admin:plugins'] }
        ]
      }
    };

    const menuData = navigationData[menuType] || { menu_items: [] };
    
    // Filter menu items based on user permissions
    if (req.user) {
      menuData.menu_items = menuData.menu_items.filter(item => {
        if (!item.permissions || item.permissions.length === 0) return true;
        return item.permissions.some(permission => userPermissions.includes(permission));
      });
    } else {
      // Show only public menu items for unauthenticated users
      menuData.menu_items = menuData.menu_items.filter(item => 
        !item.permissions || item.permissions.length === 0
      );
    }

    res.json({
      menu_type: menuType,
      brand_profile: brandProfile,
      ...menuData
    });
  } catch (error) {
    console.error('Get navigation error:', error);
    res.status(500).json({ error: 'Failed to get navigation' });
  }
});

// Theming service health check
router.get('/health', async (req, res) => {
  try {
    const health = await themingService.healthCheck();
    res.json(health);
  } catch (error) {
    console.error('Theming health check error:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

module.exports = router;
const { Pool } = require('pg');

class NavigationService {
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

    // Navigation cache
    this.navigationCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getNavigationMenu(menuType = 'main', brandProfileName = 'default', userPermissions = []) {
    const cacheKey = `nav_${menuType}_${brandProfileName}_${userPermissions.join(',')}`;
    
    // Check cache
    if (this.navigationCache.has(cacheKey)) {
      const cached = this.navigationCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return { success: true, data: cached.data };
      }
    }

    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT theming.get_navigation_menu($1, $2, $3) as menu_data',
        [menuType, brandProfileName, JSON.stringify(userPermissions)]
      );

      const menuData = result.rows[0].menu_data;
      
      // Cache the result
      this.navigationCache.set(cacheKey, {
        data: menuData,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: menuData
      };
    } catch (error) {
      console.error('Get navigation menu error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getCustomNavigation(userId, brandProfileName = 'default') {
    // For now, return a static navigation structure
    // In a full implementation, this would fetch user-specific navigation customizations
    
    const navigation = {
      main: {
        menu_items: [
          {
            label: 'Dashboard',
            path: '/dashboard',
            icon: 'dashboard',
            permissions: ['read:dashboard'],
            children: []
          },
          {
            label: 'API Integration',
            path: '/api',
            icon: 'api',
            permissions: ['read:api'],
            children: [
              {
                label: 'Providers',
                path: '/api/providers',
                permissions: ['read:api']
              },
              {
                label: 'Endpoints',
                path: '/api/endpoints',
                permissions: ['read:api']
              },
              {
                label: 'Data Processing',
                path: '/api/processing',
                permissions: ['read:api']
              }
            ]
          },
          {
            label: 'Theming',
            path: '/themes',
            icon: 'palette',
            permissions: ['read:themes'],
            children: []
          },
          {
            label: 'Plugins',
            path: '/plugins',
            icon: 'extension',
            permissions: ['read:plugins'],
            children: []
          },
          {
            label: 'Settings',
            path: '/settings',
            icon: 'settings',
            permissions: ['read:settings'],
            children: [
              {
                label: 'Profile',
                path: '/settings/profile',
                permissions: ['read:settings']
              },
              {
                label: 'Notifications',
                path: '/settings/notifications',
                permissions: ['read:settings']
              },
              {
                label: 'Security',
                path: '/settings/security',
                permissions: ['read:settings']
              }
            ]
          }
        ]
      },
      admin: {
        menu_items: [
          {
            label: 'Admin Dashboard',
            path: '/admin',
            icon: 'dashboard',
            permissions: ['admin:dashboard'],
            children: []
          },
          {
            label: 'User Management',
            path: '/admin/users',
            icon: 'users',
            permissions: ['admin:users'],
            children: [
              {
                label: 'All Users',
                path: '/admin/users',
                permissions: ['admin:users']
              },
              {
                label: 'Roles & Permissions',
                path: '/admin/users/roles',
                permissions: ['admin:users']
              }
            ]
          },
          {
            label: 'A/B Testing',
            path: '/admin/ab-testing',
            icon: 'experiment',
            permissions: ['admin:ab_testing'],
            children: [
              {
                label: 'Test Management',
                path: '/admin/ab-testing',
                permissions: ['admin:ab_testing']
              },
              {
                label: 'Results Analysis',
                path: '/admin/ab-testing/results',
                permissions: ['admin:ab_testing']
              }
            ]
          },
          {
            label: 'Analytics',
            path: '/admin/analytics',
            icon: 'analytics',
            permissions: ['admin:analytics'],
            children: [
              {
                label: 'User Metrics',
                path: '/admin/analytics/users',
                permissions: ['admin:analytics']
              },
              {
                label: 'System Performance',
                path: '/admin/analytics/system',
                permissions: ['admin:analytics']
              },
              {
                label: 'Real-time Data',
                path: '/admin/analytics/realtime',
                permissions: ['admin:analytics']
              }
            ]
          },
          {
            label: 'System Settings',
            path: '/admin/system',
            icon: 'system',
            permissions: ['admin:system'],
            children: []
          },
          {
            label: 'Feature Flags',
            path: '/admin/features',
            icon: 'flag',
            permissions: ['admin:features'],
            children: []
          },
          {
            label: 'Plugin Management',
            path: '/admin/plugins',
            icon: 'extension',
            permissions: ['admin:plugins'],
            children: []
          }
        ]
      },
      footer: {
        menu_items: [
          {
            label: 'Help',
            path: '/help',
            icon: 'help',
            permissions: [],
            children: []
          },
          {
            label: 'Privacy Policy',
            path: '/privacy',
            icon: 'privacy',
            permissions: [],
            children: []
          },
          {
            label: 'Terms of Service',
            path: '/terms',
            icon: 'terms',
            permissions: [],
            children: []
          }
        ]
      }
    };

    return {
      success: true,
      data: navigation[userId ? 'main' : 'footer'] || navigation.main
    };
  }

  filterMenuByPermissions(menuItems, userPermissions) {
    if (!Array.isArray(menuItems)) return [];
    
    return menuItems.filter(item => {
      // If no permissions required, show to everyone
      if (!item.permissions || item.permissions.length === 0) return true;
      
      // Check if user has any of the required permissions
      const hasPermission = item.permissions.some(permission => 
        userPermissions.includes(permission)
      );
      
      if (hasPermission && item.children) {
        // Recursively filter children
        item.children = this.filterMenuByPermissions(item.children, userPermissions);
      }
      
      return hasPermission;
    });
  }

  async getBreadcrumbs(path, brandProfileName = 'default') {
    // Generate breadcrumbs based on current path
    const segments = path.split('/').filter(Boolean);
    const breadcrumbs = [
      { label: 'Home', path: '/', current: false }
    ];

    let currentPath = '';
    for (let i = 0; i < segments.length; i++) {
      currentPath += '/' + segments[i];
      const isLast = i === segments.length - 1;
      
      // Generate human-readable labels
      const label = this.pathToLabel(segments[i]);
      
      breadcrumbs.push({
        label,
        path: currentPath,
        current: isLast
      });
    }

    return {
      success: true,
      data: breadcrumbs
    };
  }

  pathToLabel(segment) {
    // Convert URL segments to human-readable labels
    const labelMap = {
      'dashboard': 'Dashboard',
      'api': 'API Integration',
      'themes': 'Themes',
      'plugins': 'Plugins',
      'settings': 'Settings',
      'admin': 'Administration',
      'users': 'Users',
      'system': 'System',
      'features': 'Feature Flags',
      'analytics': 'Analytics',
      'profile': 'Profile',
      'notifications': 'Notifications',
      'security': 'Security',
      'providers': 'Providers',
      'endpoints': 'Endpoints',
      'processing': 'Data Processing',
      'roles': 'Roles & Permissions',
      'usage': 'Usage Reports',
      'performance': 'Performance',
      'help': 'Help',
      'privacy': 'Privacy Policy',
      'terms': 'Terms of Service'
    };

    return labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
  }

  async updateNavigationMenu(menuType, brandProfileId, menuItems, userId) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO theming.navigation_menus (name, display_name, menu_type, brand_profile_id, menu_items)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (name, brand_profile_id)
        DO UPDATE SET 
          menu_items = EXCLUDED.menu_items,
          updated_at = NOW()
        RETURNING *
      `;

      const values = [
        `${menuType}_nav`,
        `${menuType.charAt(0).toUpperCase() + menuType.slice(1)} Navigation`,
        menuType,
        brandProfileId,
        JSON.stringify(menuItems)
      ];

      const result = await client.query(query, values);

      await client.query('COMMIT');

      // Clear cache
      this.clearNavigationCache();

      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update navigation menu error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getMenuConfiguration(brandProfileName = 'default') {
    // Return available menu configuration options
    return {
      success: true,
      data: {
        menu_types: [
          { value: 'main', label: 'Main Navigation', description: 'Primary navigation menu' },
          { value: 'sidebar', label: 'Sidebar Menu', description: 'Sidebar navigation for admin areas' },
          { value: 'footer', label: 'Footer Menu', description: 'Footer links and navigation' },
          { value: 'mobile', label: 'Mobile Menu', description: 'Mobile-specific navigation' }
        ],
        available_icons: [
          'dashboard', 'api', 'palette', 'extension', 'settings', 'users', 'system',
          'flag', 'analytics', 'help', 'privacy', 'terms', 'security', 'notifications',
          'profile', 'providers', 'endpoints', 'processing', 'usage', 'performance'
        ],
        permission_groups: [
          { group: 'read', permissions: ['read:dashboard', 'read:api', 'read:themes', 'read:plugins', 'read:settings'] },
          { group: 'admin', permissions: ['admin:users', 'admin:system', 'admin:features', 'admin:plugins', 'admin:analytics'] }
        ]
      }
    };
  }

  // Cache Management
  clearNavigationCache() {
    this.navigationCache.clear();
  }

  // Health Check
  async healthCheck() {
    const client = await this.pool.connect();
    
    try {
      await client.query('SELECT 1 FROM theming.navigation_menus LIMIT 1');
      
      return {
        status: 'healthy',
        cache_size: this.navigationCache.size
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
    this.clearNavigationCache();
  }
}

module.exports = new NavigationService();
const { Pool } = require('pg');
const auditLogger = require('./auditLogger');

class ThemingService {
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

    // Theme cache
    this.themeCache = new Map();
    this.brandProfileCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Brand Profile Management

  async getBrandProfiles(options = {}) {
    const { active = true, limit = 50, offset = 0 } = options;
    const client = await this.pool.connect();
    
    try {
      let query = 'SELECT * FROM theming.brand_profiles';
      const params = [];
      
      if (active !== null) {
        query += ' WHERE active = $1';
        params.push(active);
      }
      
      query += ' ORDER BY created_at ASC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);
      
      const result = await client.query(query, params);
      return {
        success: true,
        data: result.rows,
        total: result.rows.length
      };
    } catch (error) {
      console.error('Get brand profiles error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getBrandProfile(nameOrId) {
    const cacheKey = `brand_profile_${nameOrId}`;
    
    // Check cache
    if (this.brandProfileCache.has(cacheKey)) {
      const cached = this.brandProfileCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return { success: true, data: cached.data };
      }
    }

    const client = await this.pool.connect();
    
    try {
      const isNumeric = !isNaN(nameOrId);
      const query = isNumeric 
        ? 'SELECT * FROM theming.brand_profiles WHERE id = $1 AND active = true'
        : 'SELECT * FROM theming.brand_profiles WHERE name = $1 AND active = true';
      
      const result = await client.query(query, [nameOrId]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Brand profile not found'
        };
      }

      const brandProfile = result.rows[0];
      
      // Cache the result
      this.brandProfileCache.set(cacheKey, {
        data: brandProfile,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: brandProfile
      };
    } catch (error) {
      console.error('Get brand profile error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async createBrandProfile(brandData, userId = null) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO theming.brand_profiles (
          name, display_name, description, logo_url, favicon_url,
          primary_color, secondary_color, accent_color, background_color,
          text_color, font_family, custom_css
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;

      const values = [
        brandData.name,
        brandData.display_name,
        brandData.description || null,
        brandData.logo_url || null,
        brandData.favicon_url || null,
        brandData.primary_color || '#007bff',
        brandData.secondary_color || '#6c757d',
        brandData.accent_color || '#28a745',
        brandData.background_color || '#ffffff',
        brandData.text_color || '#212529',
        brandData.font_family || 'Inter, system-ui, sans-serif',
        brandData.custom_css || null
      ];

      const result = await client.query(query, values);
      const newBrandProfile = result.rows[0];

      // Create default theme for this brand profile
      await this.createDefaultTheme(newBrandProfile.id, client);

      // Log the creation
      if (userId) {
        await auditLogger.log({
          resource_type: 'brand_profile',
          resource_id: newBrandProfile.id,
          action: 'created',
          user_id: userId,
          details: { brand_profile_name: newBrandProfile.name }
        });
      }

      await client.query('COMMIT');

      // Clear cache
      this.brandProfileCache.clear();

      return {
        success: true,
        data: newBrandProfile
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create brand profile error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async createDefaultTheme(brandProfileId, client = null) {
    const shouldRelease = !client;
    if (!client) {
      client = await this.pool.connect();
    }

    try {
      const query = `
        INSERT INTO theming.themes (
          name, display_name, description, theme_type, css_variables,
          brand_profile_id, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        `brand_${brandProfileId}_default`,
        'Default Theme',
        'Default theme for this brand profile',
        'light',
        JSON.stringify({
          '--background': '#ffffff',
          '--foreground': '#212529',
          '--muted': '#f8f9fa',
          '--border': '#dee2e6'
        }),
        brandProfileId,
        true
      ];

      const result = await client.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Create default theme error:', error);
      throw error;
    } finally {
      if (shouldRelease) {
        client.release();
      }
    }
  }

  // Theme Management

  async getThemes(options = {}) {
    const { brandProfileId, active = true, limit = 50, offset = 0 } = options;
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT t.*, bp.name as brand_profile_name, bp.display_name as brand_profile_display_name
        FROM theming.themes t
        LEFT JOIN theming.brand_profiles bp ON t.brand_profile_id = bp.id
      `;
      const params = [];
      const conditions = [];

      if (active !== null) {
        conditions.push(`t.active = $${params.length + 1}`);
        params.push(active);
      }

      if (brandProfileId) {
        conditions.push(`t.brand_profile_id = $${params.length + 1}`);
        params.push(brandProfileId);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ` ORDER BY t.created_at ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await client.query(query, params);
      return {
        success: true,
        data: result.rows,
        total: result.rows.length
      };
    } catch (error) {
      console.error('Get themes error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getTheme(nameOrId) {
    const cacheKey = `theme_${nameOrId}`;
    
    // Check cache
    if (this.themeCache.has(cacheKey)) {
      const cached = this.themeCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return { success: true, data: cached.data };
      }
    }

    const client = await this.pool.connect();
    
    try {
      const isNumeric = !isNaN(nameOrId);
      const query = isNumeric 
        ? `SELECT t.*, bp.name as brand_profile_name 
           FROM theming.themes t 
           LEFT JOIN theming.brand_profiles bp ON t.brand_profile_id = bp.id
           WHERE t.id = $1 AND t.active = true`
        : `SELECT t.*, bp.name as brand_profile_name 
           FROM theming.themes t 
           LEFT JOIN theming.brand_profiles bp ON t.brand_profile_id = bp.id
           WHERE t.name = $1 AND t.active = true`;
      
      const result = await client.query(query, [nameOrId]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Theme not found'
        };
      }

      const theme = result.rows[0];
      
      // Cache the result
      this.themeCache.set(cacheKey, {
        data: theme,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: theme
      };
    } catch (error) {
      console.error('Get theme error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getUserTheme(userId, brandProfileName = 'default') {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT theming.get_user_theme($1, $2) as theme_config',
        [userId, brandProfileName]
      );

      return {
        success: true,
        data: result.rows[0].theme_config
      };
    } catch (error) {
      console.error('Get user theme error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async setUserTheme(userId, themeId, customOverrides = {}) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO theming.user_theme_preferences (user_id, theme_id, custom_overrides)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id)
        DO UPDATE SET 
          theme_id = EXCLUDED.theme_id,
          custom_overrides = EXCLUDED.custom_overrides,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await client.query(query, [userId, themeId, JSON.stringify(customOverrides)]);

      // Log the change
      await auditLogger.log({
        resource_type: 'user_theme',
        resource_id: result.rows[0].id,
        action: 'updated',
        user_id: userId,
        details: { theme_id: themeId, has_overrides: Object.keys(customOverrides).length > 0 }
      });

      await client.query('COMMIT');

      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Set user theme error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // CSS Generation

  async generateThemeCSS(themeData) {
    try {
      const { brand_profile, theme, effective_config } = themeData;
      let css = '';

      // Add CSS custom properties
      css += ':root {\n';
      
      // Brand colors
      css += `  --brand-primary: ${effective_config.primary_color};\n`;
      css += `  --brand-secondary: ${effective_config.secondary_color};\n`;
      css += `  --brand-accent: ${effective_config.accent_color};\n`;
      css += `  --brand-background: ${effective_config.background_color};\n`;
      css += `  --brand-text: ${effective_config.text_color};\n`;
      css += `  --brand-font-family: ${effective_config.font_family};\n`;

      // Theme variables
      if (effective_config.css_variables) {
        for (const [key, value] of Object.entries(effective_config.css_variables)) {
          css += `  ${key}: ${value};\n`;
        }
      }

      css += '}\n\n';

      // Add font family
      css += `body {\n`;
      css += `  font-family: var(--brand-font-family);\n`;
      css += `  background-color: var(--brand-background);\n`;
      css += `  color: var(--brand-text);\n`;
      css += `}\n\n`;

      // Add theme-specific styles
      if (theme && theme.theme_type === 'dark') {
        css += `@media (prefers-color-scheme: dark) {\n`;
        css += `  :root {\n`;
        css += `    --background: var(--dark-background, #212529);\n`;
        css += `    --foreground: var(--dark-foreground, #ffffff);\n`;
        css += `  }\n`;
        css += `}\n\n`;
      }

      // Add custom CSS if present
      if (brand_profile && brand_profile.custom_css) {
        css += brand_profile.custom_css + '\n';
      }

      return {
        success: true,
        css: css
      };
    } catch (error) {
      console.error('Generate theme CSS error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Theme Switching and Hot-swapping

  async switchTheme(userId, themeName, brandProfileName = 'default') {
    try {
      // Get the theme
      const themeResult = await this.getTheme(themeName);
      if (!themeResult.success) {
        return themeResult;
      }

      // Set user theme preference
      const setResult = await this.setUserTheme(userId, themeResult.data.id);
      if (!setResult.success) {
        return setResult;
      }

      // Get the updated theme configuration
      const userThemeResult = await this.getUserTheme(userId, brandProfileName);
      if (!userThemeResult.success) {
        return userThemeResult;
      }

      // Generate CSS
      const cssResult = await this.generateThemeCSS(userThemeResult.data);
      
      return {
        success: true,
        data: {
          theme_config: userThemeResult.data,
          css: cssResult.success ? cssResult.css : null
        }
      };
    } catch (error) {
      console.error('Switch theme error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cache Management

  clearThemeCache() {
    this.themeCache.clear();
    this.brandProfileCache.clear();
  }

  // Health Check

  async healthCheck() {
    const client = await this.pool.connect();
    
    try {
      await client.query('SELECT 1 FROM theming.brand_profiles LIMIT 1');
      await client.query('SELECT 1 FROM theming.themes LIMIT 1');
      
      return {
        status: 'healthy',
        cache_size: {
          themes: this.themeCache.size,
          brand_profiles: this.brandProfileCache.size
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
    this.clearThemeCache();
  }
}

module.exports = new ThemingService();
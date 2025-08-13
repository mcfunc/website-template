const { Pool } = require('pg');
const Redis = require('ioredis');

class DashboardService {
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

    // Redis for caching
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.redis.on('error', (err) => {
      console.error('Dashboard Redis error:', err);
    });

    // Cache for dashboard configurations
    this.configCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Widget Type Management
  async getWidgetTypes(category = null) {
    const cacheKey = `widget_types:${category || 'all'}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return {
        success: true,
        data: JSON.parse(cached)
      };
    }

    const client = await this.pool.connect();
    
    try {
      const query = category 
        ? 'SELECT * FROM dashboards.widget_types WHERE category = $1 ORDER BY display_name'
        : 'SELECT * FROM dashboards.widget_types ORDER BY category, display_name';
      
      const values = category ? [category] : [];
      const result = await client.query(query, values);
      
      // Cache for 10 minutes
      await this.redis.setex(cacheKey, 600, JSON.stringify(result.rows));

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('Get widget types error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async createWidgetType(widgetData) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO dashboards.widget_types (
          name, display_name, description, category, component_path,
          config_schema, default_config, data_source, refresh_interval, 
          is_realtime, requires_permissions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `;

      const values = [
        widgetData.name,
        widgetData.display_name,
        widgetData.description || null,
        widgetData.category,
        widgetData.component_path,
        JSON.stringify(widgetData.config_schema || {}),
        JSON.stringify(widgetData.default_config || {}),
        widgetData.data_source || null,
        widgetData.refresh_interval || 30,
        widgetData.is_realtime || false,
        widgetData.requires_permissions || []
      ];

      const result = await client.query(query, values);
      
      // Clear cache
      await this.redis.del('widget_types:*');

      return {
        success: true,
        widgetTypeId: result.rows[0].id
      };
    } catch (error) {
      console.error('Create widget type error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Dashboard Management
  async getUserDashboards(userId) {
    const cacheKey = `user_dashboards:${userId}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return {
        success: true,
        data: JSON.parse(cached)
      };
    }

    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          id,
          name,
          description,
          is_default,
          is_public,
          created_at,
          updated_at
        FROM dashboards.user_dashboards
        WHERE user_id = $1
        ORDER BY is_default DESC, name
      `, [userId]);

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(result.rows));

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('Get user dashboards error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getDashboardConfig(userId, dashboardName = null) {
    const cacheKey = `dashboard_config:${userId}:${dashboardName || 'default'}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return {
        success: true,
        data: JSON.parse(cached)
      };
    }

    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT dashboards.get_user_dashboard_config($1, $2) as config',
        [userId, dashboardName]
      );

      const config = result.rows[0].config;
      
      // Cache for 2 minutes (dashboard configs change frequently)
      await this.redis.setex(cacheKey, 120, JSON.stringify(config));

      return {
        success: true,
        data: config
      };
    } catch (error) {
      console.error('Get dashboard config error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async createDashboard(userId, dashboardData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // If this is set as default, unset other defaults
      if (dashboardData.is_default) {
        await client.query(`
          UPDATE dashboards.user_dashboards 
          SET is_default = false 
          WHERE user_id = $1
        `, [userId]);
      }

      const dashboardQuery = `
        INSERT INTO dashboards.user_dashboards (
          user_id, name, description, layout_config, is_default, is_public
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;

      const dashboardValues = [
        userId,
        dashboardData.name,
        dashboardData.description || null,
        JSON.stringify(dashboardData.layout_config || {"columns": 12, "rows": []}),
        dashboardData.is_default || false,
        dashboardData.is_public || false
      ];

      const dashboardResult = await client.query(dashboardQuery, dashboardValues);
      const dashboardId = dashboardResult.rows[0].id;

      await client.query('COMMIT');
      
      // Clear cache
      await this.redis.del(`user_dashboards:${userId}`);
      await this.redis.del(`dashboard_config:${userId}:*`);

      return {
        success: true,
        dashboardId: dashboardId
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create dashboard error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async updateDashboard(userId, dashboardId, updates) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Build update query dynamically
      const updateFields = [];
      const values = [dashboardId, userId];
      let paramIndex = 3;

      if (updates.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      
      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      
      if (updates.layout_config !== undefined) {
        updateFields.push(`layout_config = $${paramIndex++}`);
        values.push(JSON.stringify(updates.layout_config));
      }
      
      if (updates.is_default !== undefined) {
        // If setting as default, unset other defaults first
        if (updates.is_default) {
          await client.query(`
            UPDATE dashboards.user_dashboards 
            SET is_default = false 
            WHERE user_id = $1
          `, [userId]);
        }
        updateFields.push(`is_default = $${paramIndex++}`);
        values.push(updates.is_default);
      }
      
      if (updates.is_public !== undefined) {
        updateFields.push(`is_public = $${paramIndex++}`);
        values.push(updates.is_public);
      }

      if (updateFields.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'No fields to update' };
      }

      updateFields.push('updated_at = NOW()');

      const query = `
        UPDATE dashboards.user_dashboards 
        SET ${updateFields.join(', ')}
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;

      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Dashboard not found or access denied' };
      }

      await client.query('COMMIT');
      
      // Clear cache
      await this.redis.del(`user_dashboards:${userId}`);
      await this.redis.del(`dashboard_config:${userId}:*`);

      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update dashboard error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Widget Instance Management
  async addWidgetToDashboard(userId, dashboardId, widgetData) {
    const client = await this.pool.connect();
    
    try {
      // Verify dashboard ownership
      const dashboardCheck = await client.query(`
        SELECT id FROM dashboards.user_dashboards 
        WHERE id = $1 AND user_id = $2
      `, [dashboardId, userId]);

      if (dashboardCheck.rows.length === 0) {
        return { success: false, error: 'Dashboard not found or access denied' };
      }

      const query = `
        INSERT INTO dashboards.dashboard_widgets (
          dashboard_id, widget_type_id, position_x, position_y, 
          width, height, config, is_visible
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      const values = [
        dashboardId,
        widgetData.widget_type_id,
        widgetData.position_x || 0,
        widgetData.position_y || 0,
        widgetData.width || 4,
        widgetData.height || 3,
        JSON.stringify(widgetData.config || {}),
        widgetData.is_visible !== undefined ? widgetData.is_visible : true
      ];

      const result = await client.query(query, values);
      
      // Clear cache
      await this.redis.del(`dashboard_config:${userId}:*`);

      return {
        success: true,
        widgetId: result.rows[0].id
      };
    } catch (error) {
      console.error('Add widget to dashboard error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async updateDashboardWidget(userId, widgetId, updates) {
    const client = await this.pool.connect();
    
    try {
      // Verify widget ownership through dashboard
      const ownershipCheck = await client.query(`
        SELECT dw.id, ud.user_id
        FROM dashboards.dashboard_widgets dw
        JOIN dashboards.user_dashboards ud ON dw.dashboard_id = ud.id
        WHERE dw.id = $1 AND ud.user_id = $2
      `, [widgetId, userId]);

      if (ownershipCheck.rows.length === 0) {
        return { success: false, error: 'Widget not found or access denied' };
      }

      // Build update query dynamically
      const updateFields = [];
      const values = [widgetId];
      let paramIndex = 2;

      if (updates.position_x !== undefined) {
        updateFields.push(`position_x = $${paramIndex++}`);
        values.push(updates.position_x);
      }
      
      if (updates.position_y !== undefined) {
        updateFields.push(`position_y = $${paramIndex++}`);
        values.push(updates.position_y);
      }
      
      if (updates.width !== undefined) {
        updateFields.push(`width = $${paramIndex++}`);
        values.push(updates.width);
      }
      
      if (updates.height !== undefined) {
        updateFields.push(`height = $${paramIndex++}`);
        values.push(updates.height);
      }
      
      if (updates.config !== undefined) {
        updateFields.push(`config = $${paramIndex++}`);
        values.push(JSON.stringify(updates.config));
      }
      
      if (updates.is_visible !== undefined) {
        updateFields.push(`is_visible = $${paramIndex++}`);
        values.push(updates.is_visible);
      }

      if (updateFields.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      updateFields.push('updated_at = NOW()');

      const query = `
        UPDATE dashboards.dashboard_widgets 
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING id
      `;

      const result = await client.query(query, values);
      
      // Clear cache
      await this.redis.del(`dashboard_config:${userId}:*`);

      return { success: true };
    } catch (error) {
      console.error('Update dashboard widget error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async removeDashboardWidget(userId, widgetId) {
    const client = await this.pool.connect();
    
    try {
      // Verify widget ownership through dashboard
      const result = await client.query(`
        DELETE FROM dashboards.dashboard_widgets dw
        USING dashboards.user_dashboards ud
        WHERE dw.dashboard_id = ud.id 
        AND dw.id = $1 
        AND ud.user_id = $2
        RETURNING dw.id
      `, [widgetId, userId]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Widget not found or access denied' };
      }
      
      // Clear cache
      await this.redis.del(`dashboard_config:${userId}:*`);

      return { success: true };
    } catch (error) {
      console.error('Remove dashboard widget error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Widget Data Methods
  async getWidgetData(widgetId, params = {}) {
    const client = await this.pool.connect();
    
    try {
      // Get widget configuration
      const widgetQuery = `
        SELECT 
          dw.config,
          wt.name as widget_type,
          wt.data_source,
          wt.refresh_interval,
          wt.is_realtime
        FROM dashboards.dashboard_widgets dw
        JOIN dashboards.widget_types wt ON dw.widget_type_id = wt.id
        WHERE dw.id = $1 AND dw.is_visible = true
      `;

      const widgetResult = await client.query(widgetQuery, [widgetId]);
      
      if (widgetResult.rows.length === 0) {
        return { success: false, error: 'Widget not found' };
      }

      const widget = widgetResult.rows[0];
      const config = { ...widget.config, ...params };

      // Get data based on widget type and data source
      let data;
      switch (widget.widget_type) {
        case 'user_activity_chart':
          data = await this.getUserActivityChartData(config);
          break;
        case 'conversion_funnel':
          data = await this.getConversionFunnelData(config);
          break;
        case 'real_time_metrics':
          data = await this.getRealTimeMetricsData(config);
          break;
        case 'line_chart':
          data = await this.getLineChartData(config);
          break;
        case 'bar_chart':
          data = await this.getBarChartData(config);
          break;
        case 'pie_chart':
          data = await this.getPieChartData(config);
          break;
        case 'alert_list':
          data = await this.getAlertListData(config);
          break;
        case 'system_health':
          data = await this.getSystemHealthData(config);
          break;
        default:
          data = { error: `Unknown widget type: ${widget.widget_type}` };
      }

      return {
        success: true,
        data: {
          widgetType: widget.widget_type,
          dataSource: widget.data_source,
          refreshInterval: widget.refresh_interval,
          isRealtime: widget.is_realtime,
          data: data,
          timestamp: new Date()
        }
      };
    } catch (error) {
      console.error('Get widget data error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Widget Data Implementations
  async getUserActivityChartData(config) {
    const { time_range = '1h', chart_type = 'line' } = config;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          DATE_TRUNC('minute', timestamp) as time_bucket,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(*) as total_events
        FROM analytics.user_events
        WHERE timestamp >= NOW() - INTERVAL $1
        GROUP BY time_bucket
        ORDER BY time_bucket
      `, [time_range]);

      return {
        chartType: chart_type,
        data: result.rows,
        labels: result.rows.map(row => row.time_bucket),
        datasets: [
          {
            label: 'Active Users',
            data: result.rows.map(row => parseInt(row.active_users)),
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)'
          },
          {
            label: 'Total Events',
            data: result.rows.map(row => parseInt(row.total_events)),
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)'
          }
        ]
      };
    } finally {
      client.release();
    }
  }

  async getConversionFunnelData(config) {
    const { funnel_steps = ['visit', 'signup', 'purchase'], time_range = '24h' } = config;
    
    const client = await this.pool.connect();
    try {
      const data = [];
      
      for (const [index, step] of funnel_steps.entries()) {
        const result = await client.query(`
          SELECT COUNT(DISTINCT user_id) as count
          FROM analytics.user_events
          WHERE event_name = $1 
          AND timestamp >= NOW() - INTERVAL $2
        `, [step, time_range]);
        
        data.push({
          step: step,
          count: parseInt(result.rows[0]?.count || 0),
          percentage: index === 0 ? 100 : 0 // Will be calculated on frontend
        });
      }

      return { steps: data };
    } finally {
      client.release();
    }
  }

  async getRealTimeMetricsData(config) {
    const { metrics = ['active_users', 'page_views', 'errors'], display_format = 'cards' } = config;
    
    // Get from Redis cache for real-time data
    const data = {};
    
    for (const metric of metrics) {
      const cached = await this.redis.get(`realtime:${metric}`);
      if (cached) {
        data[metric] = JSON.parse(cached);
      } else {
        // Fallback to database
        data[metric] = await this.getMetricFromDatabase(metric);
      }
    }

    return {
      displayFormat: display_format,
      metrics: data,
      timestamp: new Date()
    };
  }

  async getMetricFromDatabase(metric) {
    const client = await this.pool.connect();
    try {
      let query;
      switch (metric) {
        case 'active_users':
          query = `
            SELECT COUNT(DISTINCT user_id) as value
            FROM analytics.user_sessions
            WHERE started_at >= NOW() - INTERVAL '1 hour'
          `;
          break;
        case 'page_views':
          query = `
            SELECT COUNT(*) as value
            FROM analytics.page_views
            WHERE timestamp >= NOW() - INTERVAL '1 hour'
          `;
          break;
        case 'errors':
          query = `
            SELECT COUNT(*) as value
            FROM analytics.user_events
            WHERE event_type = 'error' 
            AND timestamp >= NOW() - INTERVAL '1 hour'
          `;
          break;
        default:
          return { value: 0, label: metric };
      }

      const result = await client.query(query);
      return {
        value: parseInt(result.rows[0]?.value || 0),
        label: metric.replace('_', ' ').toUpperCase()
      };
    } finally {
      client.release();
    }
  }

  async getLineChartData(config) {
    // Generic line chart implementation
    const { x_axis = 'time', y_axis = 'value', time_range = '24h' } = config;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          DATE_TRUNC('hour', timestamp) as x_value,
          COUNT(*) as y_value
        FROM analytics.user_events
        WHERE timestamp >= NOW() - INTERVAL $1
        GROUP BY x_value
        ORDER BY x_value
      `, [time_range]);

      return {
        labels: result.rows.map(row => row.x_value),
        datasets: [{
          label: y_axis,
          data: result.rows.map(row => parseInt(row.y_value)),
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.1)'
        }]
      };
    } finally {
      client.release();
    }
  }

  async getBarChartData(config) {
    const { group_by = 'page', aggregate = 'count', time_range = '24h' } = config;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          path as label,
          COUNT(*) as value
        FROM analytics.page_views
        WHERE timestamp >= NOW() - INTERVAL $1
        GROUP BY path
        ORDER BY value DESC
        LIMIT 10
      `, [time_range]);

      return {
        labels: result.rows.map(row => row.label),
        datasets: [{
          label: aggregate,
          data: result.rows.map(row => parseInt(row.value)),
          backgroundColor: [
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 205, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)',
            'rgba(153, 102, 255, 0.8)'
          ]
        }]
      };
    } finally {
      client.release();
    }
  }

  async getPieChartData(config) {
    const { value_field = 'count', label_field = 'category' } = config;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          event_type as label,
          COUNT(*) as value
        FROM analytics.user_events
        WHERE timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY event_type
        ORDER BY value DESC
      `);

      return {
        labels: result.rows.map(row => row.label),
        datasets: [{
          data: result.rows.map(row => parseInt(row.value)),
          backgroundColor: [
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 205, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)',
            'rgba(153, 102, 255, 0.8)'
          ]
        }]
      };
    } finally {
      client.release();
    }
  }

  async getAlertListData(config) {
    const { severity_filter = ['high', 'critical'], limit = 10 } = config;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          an.id,
          ar.display_name as rule_name,
          an.severity,
          an.message,
          an.triggered_at,
          an.acknowledgment_status
        FROM realtime.alert_notifications an
        JOIN realtime.alert_rules ar ON an.alert_rule_id = ar.id
        WHERE an.severity = ANY($1)
        AND an.resolved_at IS NULL
        ORDER BY an.triggered_at DESC
        LIMIT $2
      `, [severity_filter, limit]);

      return { alerts: result.rows };
    } finally {
      client.release();
    }
  }

  async getSystemHealthData(config) {
    const { services = ['database', 'redis', 'api'], include_details = true } = config;
    
    const healthData = {};
    
    for (const service of services) {
      try {
        switch (service) {
          case 'database':
            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();
            healthData[service] = { status: 'healthy', lastCheck: new Date() };
            break;
          case 'redis':
            const ping = await this.redis.ping();
            healthData[service] = { 
              status: ping === 'PONG' ? 'healthy' : 'unhealthy', 
              lastCheck: new Date() 
            };
            break;
          case 'api':
            // This would typically check API endpoint health
            healthData[service] = { status: 'healthy', lastCheck: new Date() };
            break;
        }
      } catch (error) {
        healthData[service] = { status: 'unhealthy', error: error.message, lastCheck: new Date() };
      }
    }

    return {
      services: healthData,
      overallHealth: Object.values(healthData).every(service => service.status === 'healthy') ? 'healthy' : 'degraded',
      includeDetails: include_details
    };
  }

  // Health check
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1 FROM dashboards.widget_types LIMIT 1');
      client.release();

      const redisHealth = await this.redis.ping();

      return {
        status: 'healthy',
        database: 'connected',
        redis: redisHealth === 'PONG' ? 'connected' : 'disconnected',
        cache_size: this.configCache.size
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Cleanup
  async close() {
    await this.pool.end();
    await this.redis.quit();
    this.configCache.clear();
  }
}

module.exports = new DashboardService();
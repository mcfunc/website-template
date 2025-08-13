const { Pool } = require('pg');
const Redis = require('ioredis');

class AnalyticsService {
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

    // Redis for caching and real-time metrics
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.redis.on('error', (err) => {
      console.error('Analytics Redis error:', err);
    });

    // Metrics cache
    this.metricsCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Session Management
  async startSession(userId, sessionId, metadata = {}) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO analytics.user_sessions (
          user_id, session_id, ip_address, user_agent, device_type, 
          browser, os, country, city, referrer, landing_page
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `;

      const values = [
        userId,
        sessionId,
        metadata.ip_address || null,
        metadata.user_agent || null,
        metadata.device_type || null,
        metadata.browser || null,
        metadata.os || null,
        metadata.country || null,
        metadata.city || null,
        metadata.referrer || null,
        metadata.landing_page || null
      ];

      const result = await client.query(query, values);
      
      // Cache session info in Redis
      await this.redis.setEx(`session:${sessionId}`, 3600, JSON.stringify({
        id: result.rows[0].id,
        userId,
        startedAt: new Date()
      }));

      return {
        success: true,
        sessionId: result.rows[0].id
      };
    } catch (error) {
      console.error('Start session error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async endSession(sessionId, endMetadata = {}) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE analytics.user_sessions 
        SET 
          ended_at = NOW(),
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
          exit_page = $2,
          is_bounce = CASE WHEN page_views <= 1 AND duration_seconds < 30 THEN true ELSE false END,
          updated_at = NOW()
        WHERE session_id = $1
        RETURNING id, duration_seconds
      `;

      const result = await client.query(query, [sessionId, endMetadata.exit_page]);
      
      // Remove from Redis cache
      await this.redis.del(`session:${sessionId}`);

      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      console.error('End session error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Page View Tracking
  async trackPageView(sessionId, userId, pageData) {
    const client = await this.pool.connect();
    
    try {
      // Insert page view
      const pageViewQuery = `
        INSERT INTO analytics.page_views (
          session_id, user_id, path, title, referrer, load_time_ms,
          viewport_width, viewport_height
        ) VALUES (
          (SELECT id FROM analytics.user_sessions WHERE session_id = $1),
          $2, $3, $4, $5, $6, $7, $8
        ) RETURNING id
      `;

      const pageViewValues = [
        sessionId,
        userId,
        pageData.path,
        pageData.title || null,
        pageData.referrer || null,
        pageData.load_time_ms || null,
        pageData.viewport_width || null,
        pageData.viewport_height || null
      ];

      const pageViewResult = await client.query(pageViewQuery, pageViewValues);

      // Update session page view count
      await client.query(`
        UPDATE analytics.user_sessions 
        SET page_views = page_views + 1, updated_at = NOW()
        WHERE session_id = $1
      `, [sessionId]);

      return {
        success: true,
        pageViewId: pageViewResult.rows[0].id
      };
    } catch (error) {
      console.error('Track page view error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async updatePageViewMetrics(sessionId, path, metrics) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE analytics.page_views 
        SET 
          time_on_page_seconds = $3,
          scroll_depth_percent = $4,
          updated_at = NOW()
        WHERE session_id = (SELECT id FROM analytics.user_sessions WHERE session_id = $1)
        AND path = $2
        AND time_on_page_seconds IS NULL
      `;

      await client.query(query, [
        sessionId,
        path,
        metrics.time_on_page_seconds || null,
        metrics.scroll_depth_percent || null
      ]);

      return { success: true };
    } catch (error) {
      console.error('Update page view metrics error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Event Tracking
  async trackEvent(sessionId, userId, eventData) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO analytics.user_events (
          session_id, user_id, event_type, event_name, category, 
          label, value, properties, page_path
        ) VALUES (
          (SELECT id FROM analytics.user_sessions WHERE session_id = $1),
          $2, $3, $4, $5, $6, $7, $8, $9
        ) RETURNING id
      `;

      const values = [
        sessionId,
        userId,
        eventData.event_type,
        eventData.event_name,
        eventData.category || null,
        eventData.label || null,
        eventData.value || null,
        eventData.properties ? JSON.stringify(eventData.properties) : null,
        eventData.page_path || null
      ];

      const result = await client.query(query, values);

      // Update session actions count
      await client.query(`
        UPDATE analytics.user_sessions 
        SET actions_count = actions_count + 1, updated_at = NOW()
        WHERE session_id = $1
      `, [sessionId]);

      // Store in Redis for real-time analytics
      const eventKey = `events:${new Date().toISOString().slice(0, 10)}`;
      await this.redis.lPush(eventKey, JSON.stringify({
        id: result.rows[0].id,
        sessionId,
        userId,
        ...eventData,
        timestamp: new Date()
      }));
      await this.redis.expire(eventKey, 86400); // Expire after 24 hours

      return {
        success: true,
        eventId: result.rows[0].id
      };
    } catch (error) {
      console.error('Track event error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Analytics Retrieval
  async getUserMetrics(userId, startDate, endDate) {
    const cacheKey = `user_metrics:${userId}:${startDate}:${endDate}`;
    
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
        'SELECT analytics.get_user_metrics($1, $2, $3) as metrics',
        [userId, startDate, endDate]
      );

      const metrics = result.rows[0].metrics;
      
      // Cache for 15 minutes
      await this.redis.setEx(cacheKey, 900, JSON.stringify(metrics));

      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      console.error('Get user metrics error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getSystemMetrics(startDate, endDate, serviceName = null) {
    const cacheKey = `system_metrics:${serviceName || 'all'}:${startDate}:${endDate}`;
    
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
      const query = `
        SELECT 
          metric_name,
          metric_type,
          service_name,
          AVG(value) as avg_value,
          MIN(value) as min_value,
          MAX(value) as max_value,
          COUNT(*) as data_points,
          unit,
          DATE_TRUNC('hour', timestamp) as hour
        FROM analytics.system_metrics
        WHERE timestamp BETWEEN $1 AND $2
        ${serviceName ? 'AND service_name = $3' : ''}
        GROUP BY metric_name, metric_type, service_name, unit, hour
        ORDER BY hour DESC, metric_name
      `;

      const values = serviceName ? [startDate, endDate, serviceName] : [startDate, endDate];
      const result = await client.query(query, values);

      // Cache for 5 minutes
      await this.redis.setEx(cacheKey, 300, JSON.stringify(result.rows));

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('Get system metrics error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getDashboardMetrics(timeframe = '24h') {
    const cacheKey = `dashboard_metrics:${timeframe}`;
    
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
      let interval, startDate;
      
      switch (timeframe) {
        case '1h':
          interval = '1 hour';
          startDate = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case '24h':
          interval = '24 hours';
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          interval = '7 days';
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          interval = '30 days';
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          interval = '24 hours';
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      const queries = {
        // Active users
        activeUsers: `
          SELECT COUNT(DISTINCT user_id) as count
          FROM analytics.user_sessions
          WHERE started_at >= $1
        `,
        
        // Total sessions
        totalSessions: `
          SELECT COUNT(*) as count
          FROM analytics.user_sessions
          WHERE started_at >= $1
        `,
        
        // Page views
        pageViews: `
          SELECT COUNT(*) as count
          FROM analytics.page_views
          WHERE timestamp >= $1
        `,
        
        // Events
        totalEvents: `
          SELECT COUNT(*) as count
          FROM analytics.user_events
          WHERE timestamp >= $1
        `,

        // Average session duration
        avgSessionDuration: `
          SELECT AVG(duration_seconds) as avg_duration
          FROM analytics.user_sessions
          WHERE started_at >= $1 AND ended_at IS NOT NULL
        `,

        // Bounce rate
        bounceRate: `
          SELECT 
            COUNT(CASE WHEN is_bounce THEN 1 END)::DECIMAL / COUNT(*) * 100 as bounce_rate
          FROM analytics.user_sessions
          WHERE started_at >= $1
        `,

        // Top pages
        topPages: `
          SELECT 
            path,
            COUNT(*) as views,
            COUNT(DISTINCT user_id) as unique_users
          FROM analytics.page_views
          WHERE timestamp >= $1
          GROUP BY path
          ORDER BY views DESC
          LIMIT 10
        `,

        // Top events
        topEvents: `
          SELECT 
            event_name,
            event_type,
            COUNT(*) as count,
            COUNT(DISTINCT user_id) as unique_users
          FROM analytics.user_events
          WHERE timestamp >= $1
          GROUP BY event_name, event_type
          ORDER BY count DESC
          LIMIT 10
        `
      };

      const results = {};
      
      for (const [key, query] of Object.entries(queries)) {
        const result = await client.query(query, [startDate]);
        results[key] = result.rows;
      }

      const dashboardData = {
        timeframe,
        interval,
        startDate,
        endDate: new Date(),
        metrics: {
          activeUsers: results.activeUsers[0]?.count || 0,
          totalSessions: results.totalSessions[0]?.count || 0,
          pageViews: results.pageViews[0]?.count || 0,
          totalEvents: results.totalEvents[0]?.count || 0,
          avgSessionDuration: Math.round(results.avgSessionDuration[0]?.avg_duration || 0),
          bounceRate: parseFloat(results.bounceRate[0]?.bounce_rate || 0).toFixed(2)
        },
        topPages: results.topPages,
        topEvents: results.topEvents
      };

      // Cache for 2 minutes for dashboard metrics
      await this.redis.setEx(cacheKey, 120, JSON.stringify(dashboardData));

      return {
        success: true,
        data: dashboardData
      };
    } catch (error) {
      console.error('Get dashboard metrics error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // System Metrics Recording
  async recordSystemMetric(metricName, metricType, value, options = {}) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT analytics.record_system_metric($1, $2, $3, $4, $5, $6, $7) as metric_id
      `;

      const values = [
        metricName,
        metricType,
        value,
        options.serviceName || null,
        options.instanceId || null,
        options.unit || null,
        options.tags ? JSON.stringify(options.tags) : '{}'
      ];

      const result = await client.query(query, values);

      // Also store in Redis for real-time monitoring
      const redisKey = `metrics:${metricType}:${metricName}`;
      await this.redis.lPush(redisKey, JSON.stringify({
        value,
        timestamp: new Date(),
        ...options
      }));
      await this.redis.lTrim(redisKey, 0, 99); // Keep last 100 values
      await this.redis.expire(redisKey, 3600); // Expire after 1 hour

      return {
        success: true,
        metricId: result.rows[0].metric_id
      };
    } catch (error) {
      console.error('Record system metric error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Real-time Analytics
  async getRealTimeMetrics() {
    try {
      const metrics = {
        activeUsers: 0,
        pageViews: 0,
        events: 0,
        errors: 0
      };

      // Get active users from Redis (sessions active in last 5 minutes)
      const activeSessionsKey = `active_sessions:${Math.floor(Date.now() / (5 * 60 * 1000))}`;
      const activeSessions = await this.redis.sCard(activeSessionsKey);
      metrics.activeUsers = activeSessions;

      // Get recent events
      const today = new Date().toISOString().slice(0, 10);
      const todayEventsKey = `events:${today}`;
      const recentEvents = await this.redis.lRange(todayEventsKey, 0, -1);
      
      const last5Minutes = Date.now() - 5 * 60 * 1000;
      const recentData = recentEvents
        .map(event => JSON.parse(event))
        .filter(event => new Date(event.timestamp).getTime() > last5Minutes);

      metrics.events = recentData.length;
      metrics.pageViews = recentData.filter(e => e.event_type === 'page_view').length;
      metrics.errors = recentData.filter(e => e.event_type === 'error').length;

      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      console.error('Get real-time metrics error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Health Check
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1 FROM analytics.user_sessions LIMIT 1');
      client.release();

      const redisHealth = await this.redis.ping();

      return {
        status: 'healthy',
        database: 'connected',
        redis: redisHealth === 'PONG' ? 'connected' : 'disconnected',
        cache_size: this.metricsCache.size
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
    this.metricsCache.clear();
  }
}

module.exports = new AnalyticsService();
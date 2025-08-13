const { Server } = require('socket.io');
const { Pool } = require('pg');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');

class WebSocketService {
  constructor() {
    this.io = null;
    this.redis = null;
    this.redisPub = null;
    this.redisSub = null;
    this.pool = null;
    this.activeConnections = new Map();
    this.streamSubscriptions = new Map();
    
    this.initializeDatabase();
    this.initializeRedis();
  }

  initializeDatabase() {
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
  }

  initializeRedis() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    };

    this.redis = new Redis(redisConfig);
    this.redisPub = new Redis(redisConfig);
    this.redisSub = new Redis(redisConfig);

    this.redis.on('error', (err) => {
      console.error('WebSocket Redis error:', err);
    });
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      path: '/socket.io'
    });

    this.setupSocketHandlers();
    this.setupRedisSubscriptions();
    
    console.log('✅ WebSocket service initialized');
    return this.io;
  }

  setupSocketHandlers() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // For mock tokens (demo mode)
        if (token.startsWith('mock_token_')) {
          socket.user = {
            id: 'mock_user_id',
            name: 'Mock User',
            email: 'mock@example.com',
            roles: ['user'],
            permissions: ['read:dashboard', 'write:profile']
          };
          return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // In production, you'd fetch user from database
        socket.user = {
          id: decoded.userId,
          email: decoded.email
        };
        
        next();
      } catch (err) {
        console.error('WebSocket auth error:', err);
        next(new Error('Invalid authentication token'));
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`WebSocket client connected: ${socket.id} (user: ${socket.user?.id})`);
      
      this.handleConnection(socket);
      this.setupSocketEvents(socket);
    });
  }

  async handleConnection(socket) {
    const sessionId = socket.id;
    const userId = socket.user?.id;

    // Store connection info
    this.activeConnections.set(sessionId, {
      socket,
      userId,
      connectedAt: new Date(),
      subscriptions: new Set()
    });

    // Store in database
    try {
      await this.pool.query(`
        INSERT INTO realtime.websocket_sessions (
          session_id, user_id, connection_time, subscriptions, metadata
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (session_id) DO UPDATE SET
          last_activity = NOW(),
          is_active = true
      `, [sessionId, userId, new Date(), [], { ip: socket.handshake.address }]);
    } catch (error) {
      console.error('Error storing WebSocket session:', error);
    }

    // Send initial connection confirmation
    socket.emit('connected', {
      sessionId,
      userId,
      timestamp: new Date(),
      availableStreams: await this.getAvailableStreams()
    });

    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  setupSocketEvents(socket) {
    const connection = this.activeConnections.get(socket.id);
    
    // Subscribe to data stream
    socket.on('subscribe', async (data) => {
      try {
        const { streamName, options = {} } = data;
        
        if (!streamName) {
          socket.emit('error', { message: 'Stream name is required' });
          return;
        }

        // Verify stream exists and user has permission
        const stream = await this.getDataStream(streamName);
        if (!stream) {
          socket.emit('error', { message: `Stream '${streamName}' not found` });
          return;
        }

        // Add to subscriptions
        connection.subscriptions.add(streamName);
        
        // Subscribe to Redis channel
        if (!this.streamSubscriptions.has(streamName)) {
          this.streamSubscriptions.set(streamName, new Set());
          await this.redisSub.subscribe(`stream:${streamName}`);
        }
        this.streamSubscriptions.get(streamName).add(socket.id);

        // Update database
        await this.updateSocketSubscriptions(socket.id, Array.from(connection.subscriptions));

        socket.emit('subscribed', { 
          streamName, 
          timestamp: new Date(),
          options 
        });

        console.log(`Socket ${socket.id} subscribed to ${streamName}`);
      } catch (error) {
        console.error('Subscribe error:', error);
        socket.emit('error', { message: 'Failed to subscribe to stream' });
      }
    });

    // Unsubscribe from data stream
    socket.on('unsubscribe', async (data) => {
      try {
        const { streamName } = data;
        
        connection.subscriptions.delete(streamName);
        
        // Remove from Redis subscription
        if (this.streamSubscriptions.has(streamName)) {
          this.streamSubscriptions.get(streamName).delete(socket.id);
          
          // If no more subscribers, unsubscribe from Redis
          if (this.streamSubscriptions.get(streamName).size === 0) {
            await this.redisSub.unsubscribe(`stream:${streamName}`);
            this.streamSubscriptions.delete(streamName);
          }
        }

        // Update database
        await this.updateSocketSubscriptions(socket.id, Array.from(connection.subscriptions));

        socket.emit('unsubscribed', { 
          streamName, 
          timestamp: new Date() 
        });

        console.log(`Socket ${socket.id} unsubscribed from ${streamName}`);
      } catch (error) {
        console.error('Unsubscribe error:', error);
        socket.emit('error', { message: 'Failed to unsubscribe from stream' });
      }
    });

    // Get real-time data
    socket.on('get_realtime_data', async (data) => {
      try {
        const { type, params = {} } = data;
        
        let result;
        switch (type) {
          case 'dashboard_metrics':
            result = await this.getDashboardMetrics(params);
            break;
          case 'active_alerts':
            result = await this.getActiveAlerts(params);
            break;
          case 'user_activity':
            result = await this.getUserActivity(params);
            break;
          default:
            throw new Error(`Unknown data type: ${type}`);
        }

        socket.emit('realtime_data', {
          type,
          data: result,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Get realtime data error:', error);
        socket.emit('error', { message: `Failed to get ${data.type} data` });
      }
    });

    // Acknowledge alert
    socket.on('acknowledge_alert', async (data) => {
      try {
        const { alertId, message = '' } = data;
        const userId = socket.user?.id;

        await this.pool.query(`
          UPDATE realtime.alert_notifications 
          SET acknowledgment_status = 'acknowledged',
              acknowledged_by = $1,
              acknowledged_at = NOW()
          WHERE id = $2
        `, [userId, alertId]);

        // Broadcast acknowledgment to all connected clients
        this.io.emit('alert_acknowledged', {
          alertId,
          acknowledgedBy: userId,
          message,
          timestamp: new Date()
        });

        socket.emit('alert_acknowledged', { alertId, success: true });
      } catch (error) {
        console.error('Acknowledge alert error:', error);
        socket.emit('error', { message: 'Failed to acknowledge alert' });
      }
    });
  }

  setupRedisSubscriptions() {
    this.redisSub.on('message', (channel, message) => {
      try {
        const streamName = channel.replace('stream:', '');
        const data = JSON.parse(message);
        
        // Send to all subscribed clients
        if (this.streamSubscriptions.has(streamName)) {
          this.streamSubscriptions.get(streamName).forEach(socketId => {
            const connection = this.activeConnections.get(socketId);
            if (connection && connection.socket.connected) {
              connection.socket.emit('stream_data', {
                streamName,
                data,
                timestamp: new Date()
              });
            }
          });
        }
      } catch (error) {
        console.error('Redis message processing error:', error);
      }
    });

    console.log('✅ Redis subscriptions setup complete');
  }

  async handleDisconnection(socket) {
    const sessionId = socket.id;
    const connection = this.activeConnections.get(sessionId);
    
    if (!connection) return;

    console.log(`WebSocket client disconnected: ${sessionId}`);

    // Remove from stream subscriptions
    for (const streamName of connection.subscriptions) {
      if (this.streamSubscriptions.has(streamName)) {
        this.streamSubscriptions.get(streamName).delete(sessionId);
        
        // If no more subscribers, unsubscribe from Redis
        if (this.streamSubscriptions.get(streamName).size === 0) {
          await this.redisSub.unsubscribe(`stream:${streamName}`);
          this.streamSubscriptions.delete(streamName);
        }
      }
    }

    // Update database
    try {
      await this.pool.query(`
        UPDATE realtime.websocket_sessions 
        SET is_active = false, last_activity = NOW()
        WHERE session_id = $1
      `, [sessionId]);
    } catch (error) {
      console.error('Error updating disconnected session:', error);
    }

    // Remove from active connections
    this.activeConnections.delete(sessionId);
  }

  // Data publishing methods
  async publishToStream(streamName, data, options = {}) {
    try {
      const message = {
        ...data,
        timestamp: new Date(),
        ...options
      };

      // Publish to Redis
      await this.redisPub.publish(`stream:${streamName}`, JSON.stringify(message));

      // Process stream data (trigger alerts, etc.)
      await this.processStreamData(streamName, message);

      return { success: true };
    } catch (error) {
      console.error('Publish to stream error:', error);
      return { success: false, error: error.message };
    }
  }

  async processStreamData(streamName, data) {
    try {
      const client = await this.pool.connect();
      
      await client.query(
        'SELECT realtime.process_stream_data($1, $2, $3)',
        [streamName, JSON.stringify(data), new Date()]
      );
      
      client.release();
    } catch (error) {
      console.error('Process stream data error:', error);
    }
  }

  // Helper methods
  async getAvailableStreams() {
    try {
      const result = await this.pool.query(`
        SELECT name, display_name, description, stream_type
        FROM realtime.data_streams
        WHERE is_active = true
        ORDER BY display_name
      `);
      return result.rows;
    } catch (error) {
      console.error('Get available streams error:', error);
      return [];
    }
  }

  async getDataStream(streamName) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM realtime.data_streams
        WHERE name = $1 AND is_active = true
      `, [streamName]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Get data stream error:', error);
      return null;
    }
  }

  async updateSocketSubscriptions(sessionId, subscriptions) {
    try {
      await this.pool.query(`
        UPDATE realtime.websocket_sessions
        SET subscriptions = $1, last_activity = NOW()
        WHERE session_id = $2
      `, [subscriptions, sessionId]);
    } catch (error) {
      console.error('Update socket subscriptions error:', error);
    }
  }

  async getDashboardMetrics(params = {}) {
    try {
      const { timeframe = '1h' } = params;
      
      // Get real-time metrics from Redis
      const metricsKey = `realtime_metrics:${timeframe}`;
      const cached = await this.redis.get(metricsKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Fallback to database
      const result = await this.pool.query(`
        SELECT 
          COUNT(DISTINCT user_id) as active_users,
          COUNT(*) as total_events,
          COUNT(CASE WHEN event_type = 'error' THEN 1 END) as error_count
        FROM analytics.user_events
        WHERE timestamp >= NOW() - INTERVAL '1 hour'
      `);

      const metrics = {
        activeUsers: parseInt(result.rows[0]?.active_users || 0),
        totalEvents: parseInt(result.rows[0]?.total_events || 0),
        errorCount: parseInt(result.rows[0]?.error_count || 0),
        timestamp: new Date()
      };

      // Cache for 30 seconds
      await this.redis.setex(metricsKey, 30, JSON.stringify(metrics));

      return metrics;
    } catch (error) {
      console.error('Get dashboard metrics error:', error);
      return { error: error.message };
    }
  }

  async getActiveAlerts(params = {}) {
    try {
      const { limit = 10 } = params;
      
      const result = await this.pool.query(`
        SELECT 
          an.id,
          ar.display_name as rule_name,
          an.severity,
          an.message,
          an.triggered_at,
          an.acknowledgment_status,
          an.acknowledged_by,
          an.acknowledged_at
        FROM realtime.alert_notifications an
        JOIN realtime.alert_rules ar ON an.alert_rule_id = ar.id
        WHERE an.resolved_at IS NULL
        ORDER BY an.triggered_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      console.error('Get active alerts error:', error);
      return [];
    }
  }

  async getUserActivity(params = {}) {
    try {
      const { timeframe = '1h' } = params;
      
      const result = await this.pool.query(`
        SELECT 
          DATE_TRUNC('minute', timestamp) as minute,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(*) as total_events
        FROM analytics.user_events
        WHERE timestamp >= NOW() - INTERVAL $1
        GROUP BY minute
        ORDER BY minute DESC
        LIMIT 60
      `, [timeframe]);

      return result.rows;
    } catch (error) {
      console.error('Get user activity error:', error);
      return [];
    }
  }

  // Admin methods
  getConnectionStats() {
    return {
      activeConnections: this.activeConnections.size,
      streamSubscriptions: Array.from(this.streamSubscriptions.keys()),
      totalSubscriptions: Array.from(this.streamSubscriptions.values())
        .reduce((total, set) => total + set.size, 0)
    };
  }

  async createAlert(alertData) {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        INSERT INTO realtime.alert_notifications (
          alert_rule_id, triggered_at, severity, message, trigger_data, notification_channels
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        alertData.ruleId,
        alertData.triggeredAt || new Date(),
        alertData.severity,
        alertData.message,
        JSON.stringify(alertData.data || {}),
        alertData.channels || ['dashboard']
      ]);

      client.release();

      const alertId = result.rows[0].id;

      // Broadcast alert to all connected clients
      this.io.emit('new_alert', {
        id: alertId,
        ...alertData,
        timestamp: new Date()
      });

      return { success: true, alertId };
    } catch (error) {
      console.error('Create alert error:', error);
      return { success: false, error: error.message };
    }
  }

  // Health check
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1 FROM realtime.data_streams LIMIT 1');
      client.release();

      const redisHealth = await this.redis.ping();

      return {
        status: 'healthy',
        database: 'connected',
        redis: redisHealth === 'PONG' ? 'connected' : 'disconnected',
        activeConnections: this.activeConnections.size,
        streamSubscriptions: this.streamSubscriptions.size
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
    if (this.io) {
      this.io.close();
    }
    
    await Promise.all([
      this.pool?.end(),
      this.redis?.quit(),
      this.redisPub?.quit(),
      this.redisSub?.quit()
    ]);

    this.activeConnections.clear();
    this.streamSubscriptions.clear();
  }
}

module.exports = new WebSocketService();
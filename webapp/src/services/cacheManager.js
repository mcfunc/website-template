const Redis = require('ioredis');
const { Pool } = require('pg');

class CacheManager {
  constructor() {
    // Redis connection with retry logic
    const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
    this.redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3
    });

    // Database connection for cache warming
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

    // Cache configuration
    this.config = {
      defaultTTL: 300, // 5 minutes
      shortTTL: 60,    // 1 minute
      longTTL: 3600,   // 1 hour
      maxRetries: 3,
      retryDelay: 100
    };

    // Cache key patterns
    this.keyPatterns = {
      api: 'api:cache:{provider}:{endpoint}:{params}',
      user: 'user:cache:{userId}:{type}',
      kpi: 'kpi:cache:{dataType}:{period}:{userId}',
      processed: 'processed:cache:{dataType}:{hash}',
      quality: 'quality:cache:{endpointId}:{dataType}:{date}',
      rateLimit: 'rate_limit:{providerId}:{userId}',
      session: 'session:{sessionId}',
      temp: 'temp:{key}'
    };

    // Redis error handling
    this.redis.on('error', (err) => {
      console.error('Redis error:', err);
    });

    this.redis.on('connect', () => {
      console.log('Redis connected');
    });

    this.redis.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });
  }

  // Generic cache operations
  async get(key, options = {}) {
    try {
      const { parse = true, defaultValue = null } = options;
      const value = await this.redis.get(key);
      
      if (value === null) {
        return defaultValue;
      }
      
      return parse ? JSON.parse(value) : value;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return options.defaultValue || null;
    }
  }

  async set(key, value, ttl = this.config.defaultTTL) {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.redis.setex(key, ttl, serialized);
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async del(key) {
    try {
      return await this.redis.del(key);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key) {
    try {
      return await this.redis.exists(key) === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key) {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      console.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  // Specialized cache methods
  
  // API response caching
  async cacheAPIResponse(provider, endpoint, params, data, ttl = this.config.defaultTTL) {
    const key = this.buildKey('api', { provider, endpoint, params: JSON.stringify(params) });
    return await this.set(key, {
      data,
      cached_at: Date.now(),
      ttl
    }, ttl);
  }

  async getAPIResponse(provider, endpoint, params) {
    const key = this.buildKey('api', { provider, endpoint, params: JSON.stringify(params) });
    return await this.get(key);
  }

  // User data caching
  async cacheUserData(userId, dataType, data, ttl = this.config.shortTTL) {
    const key = this.buildKey('user', { userId, type: dataType });
    return await this.set(key, data, ttl);
  }

  async getUserData(userId, dataType) {
    const key = this.buildKey('user', { userId, type: dataType });
    return await this.get(key);
  }

  // KPI caching
  async cacheKPIData(dataType, period, userId, kpiData, ttl = this.config.longTTL) {
    const key = this.buildKey('kpi', { dataType, period, userId });
    return await this.set(key, {
      ...kpiData,
      calculated_at: Date.now()
    }, ttl);
  }

  async getKPIData(dataType, period, userId) {
    const key = this.buildKey('kpi', { dataType, period, userId });
    return await this.get(key);
  }

  // Processed data caching (for deduplication)
  async cacheProcessedData(dataType, hash, processedId, ttl = this.config.longTTL) {
    const key = this.buildKey('processed', { dataType, hash });
    return await this.set(key, { processedId, cached_at: Date.now() }, ttl);
  }

  async getProcessedData(dataType, hash) {
    const key = this.buildKey('processed', { dataType, hash });
    return await this.get(key);
  }

  // Data quality metrics caching
  async cacheQualityMetrics(endpointId, dataType, date, metrics, ttl = this.config.longTTL) {
    const key = this.buildKey('quality', { endpointId, dataType, date });
    return await this.set(key, metrics, ttl);
  }

  async getQualityMetrics(endpointId, dataType, date) {
    const key = this.buildKey('quality', { endpointId, dataType, date });
    return await this.get(key);
  }

  // Rate limiting with Redis
  async checkRateLimit(providerId, userId, limit, window) {
    const key = this.buildKey('rateLimit', { providerId, userId: userId || 'global' });
    
    try {
      const current = await this.redis.get(key);
      const count = parseInt(current || '0');
      
      if (count >= limit) {
        const ttl = await this.redis.ttl(key);
        return {
          allowed: false,
          count,
          limit,
          resetTime: Date.now() + (ttl * 1000)
        };
      }
      
      // Increment counter
      if (current) {
        await this.redis.incr(key);
      } else {
        await this.redis.setex(key, window, 1);
      }
      
      return {
        allowed: true,
        count: count + 1,
        limit,
        remaining: limit - count - 1
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Fail open - allow request if Redis is down
      return { allowed: true, count: 0, limit, remaining: limit };
    }
  }

  // Session caching
  async cacheSession(sessionId, sessionData, ttl = 86400) { // 24 hours
    const key = this.buildKey('session', { sessionId });
    return await this.set(key, sessionData, ttl);
  }

  async getSession(sessionId) {
    const key = this.buildKey('session', { sessionId });
    return await this.get(key);
  }

  async deleteSession(sessionId) {
    const key = this.buildKey('session', { sessionId });
    return await this.del(key);
  }

  // Temporary data (for processing workflows)
  async setTemp(tempKey, data, ttl = this.config.shortTTL) {
    const key = this.buildKey('temp', { key: tempKey });
    return await this.set(key, data, ttl);
  }

  async getTemp(tempKey) {
    const key = this.buildKey('temp', { key: tempKey });
    return await this.get(key);
  }

  async deleteTemp(tempKey) {
    const key = this.buildKey('temp', { key: tempKey });
    return await this.del(key);
  }

  // Build cache key from pattern
  buildKey(pattern, params) {
    let key = this.keyPatterns[pattern];
    
    if (!key) {
      throw new Error(`Unknown cache key pattern: ${pattern}`);
    }
    
    // Replace placeholders with actual values
    for (const [param, value] of Object.entries(params)) {
      key = key.replace(`{${param}}`, value);
    }
    
    return key;
  }

  // Batch operations
  async mget(keys) {
    try {
      const values = await this.redis.mget(keys);
      return values.map(value => {
        try {
          return value ? JSON.parse(value) : null;
        } catch {
          return value;
        }
      });
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs, ttl = this.config.defaultTTL) {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        pipeline.setex(key, ttl, serialized);
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Cache mset error:', error);
      return false;
    }
  }

  // Cache warming from database
  async warmCache(dataType, options = {}) {
    const { userId, limit = 100, ttl = this.config.defaultTTL } = options;
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT id, normalized_data, data_hash, created_at
        FROM api.processed_data
        WHERE data_type = $1
      `;
      
      const params = [dataType];
      
      if (userId) {
        query += ' AND user_id = $2';
        params.push(userId);
      }
      
      query += ` ORDER BY created_at DESC LIMIT ${limit}`;
      
      const result = await client.query(query, params);
      const cached = [];
      
      for (const row of result.rows) {
        if (row.data_hash) {
          const cacheKey = this.buildKey('processed', { 
            dataType, 
            hash: row.data_hash 
          });
          
          await this.set(cacheKey, {
            processedId: row.id,
            data: row.normalized_data,
            warmed_at: Date.now()
          }, ttl);
          
          cached.push(cacheKey);
        }
      }
      
      return {
        success: true,
        cached: cached.length,
        total: result.rows.length
      };
      
    } catch (error) {
      console.error('Cache warming error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Cache invalidation patterns
  async invalidatePattern(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        return await this.redis.del(...keys);
      }
      return 0;
    } catch (error) {
      console.error('Cache invalidation error:', error);
      return 0;
    }
  }

  async invalidateUserCache(userId) {
    const pattern = this.buildKey('user', { userId, type: '*' });
    return await this.invalidatePattern(pattern);
  }

  async invalidateAPICache(provider, endpoint = '*') {
    const pattern = this.buildKey('api', { provider, endpoint, params: '*' });
    return await this.invalidatePattern(pattern);
  }

  // Cache statistics
  async getStats() {
    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      return {
        memory: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace),
        connected: this.redis.status === 'ready'
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        memory: {},
        keyspace: {},
        connected: false,
        error: error.message
      };
    }
  }

  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const parsed = {};
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        parsed[key] = isNaN(value) ? value : parseFloat(value);
      }
    }
    
    return parsed;
  }

  // Cache health check
  async healthCheck() {
    try {
      const testKey = 'health_check_' + Date.now();
      const testValue = { timestamp: Date.now() };
      
      // Test write
      await this.set(testKey, testValue, 5);
      
      // Test read
      const retrieved = await this.get(testKey);
      
      // Test delete
      await this.del(testKey);
      
      const isHealthy = retrieved && retrieved.timestamp === testValue.timestamp;
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        connected: this.redis.status === 'ready',
        operations: {
          read: !!retrieved,
          write: true,
          delete: true
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      };
    }
  }

  // Cleanup method
  async close() {
    await this.redis.quit();
    await this.pool.end();
  }
}

module.exports = new CacheManager();
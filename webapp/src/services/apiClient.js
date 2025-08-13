const axios = require('axios');
const { Pool } = require('pg');
const Redis = require('ioredis');
const auditLogger = require('./auditLogger');

class ExternalAPIClient {
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

    // Redis connection for caching
    const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
    this.redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    // Rate limiting storage
    this.rateLimits = new Map();
    
    // Default configuration
    this.defaultConfig = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      maxCacheAge: 300 // 5 minutes
    };
  }

  // Get API provider configuration
  async getProvider(providerName) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM api.providers WHERE name = $1 AND active = true',
        [providerName]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error getting provider:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Get endpoint configuration
  async getEndpoint(providerName, endpointName) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT e.*, p.base_url, p.auth_type, p.auth_config, p.rate_limit_requests, p.rate_limit_window
        FROM api.endpoints e
        JOIN api.providers p ON e.provider_id = p.id
        WHERE p.name = $1 AND e.name = $2 AND e.active = true AND p.active = true
      `, [providerName, endpointName]);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting endpoint:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Check rate limits
  async checkRateLimit(providerId, userId = null) {
    const key = `rate_limit:${providerId}:${userId || 'global'}`;
    const now = Date.now();
    const windowStart = now - (60 * 60 * 1000); // 1 hour window
    
    try {
      // Get current request count from Redis
      const current = await this.redis.get(key);
      const provider = await this.getProviderById(providerId);
      
      if (!provider) {
        throw new Error('Provider not found');
      }
      
      const limit = provider.rate_limit_requests || 100;
      const currentCount = parseInt(current || '0');
      
      if (currentCount >= limit) {
        const resetTime = await this.redis.ttl(key);
        throw new Error(`Rate limit exceeded. Reset in ${resetTime} seconds`);
      }
      
      // Increment counter
      await this.redis.setex(key, provider.rate_limit_window || 3600, currentCount + 1);
      
      return {
        allowed: true,
        remaining: limit - currentCount - 1,
        reset: Math.floor(now / 1000) + (provider.rate_limit_window || 3600)
      };
    } catch (error) {
      if (error.message.includes('Rate limit exceeded')) {
        throw error;
      }
      console.error('Rate limit check error:', error);
      return { allowed: true, remaining: 999, reset: Math.floor(now / 1000) + 3600 };
    }
  }

  // Get OAuth2 token for user and provider
  async getOAuthToken(providerId, userId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT * FROM api.oauth_tokens
        WHERE provider_id = $1 AND user_id = $2
        ORDER BY created_at DESC LIMIT 1
      `, [providerId, userId]);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting OAuth token:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Refresh OAuth2 token
  async refreshOAuthToken(tokenId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT api.refresh_oauth_token($1)', [tokenId]);
      return result.rows[0].refresh_oauth_token;
    } catch (error) {
      console.error('Error refreshing OAuth token:', error);
      await this.logError(null, null, 'oauth_refresh_failed', error.message, {
        token_id: tokenId,
        error: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // Build request headers with authentication
  async buildHeaders(endpoint, userId = null) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'SiteTemplate/1.0',
      ...endpoint.headers
    };

    // Add authentication based on provider config
    if (endpoint.auth_type === 'oauth2' && userId) {
      const token = await this.getOAuthToken(endpoint.provider_id, userId);
      if (token) {
        // Check if token needs refresh
        if (token.expires_at && new Date(token.expires_at) <= new Date()) {
          await this.refreshOAuthToken(token.id);
          // Get refreshed token
          const refreshedToken = await this.getOAuthToken(endpoint.provider_id, userId);
          if (refreshedToken) {
            headers.Authorization = `${refreshedToken.token_type || 'Bearer'} ${refreshedToken.access_token}`;
          }
        } else {
          headers.Authorization = `${token.token_type || 'Bearer'} ${token.access_token}`;
        }
      }
    } else if (endpoint.auth_type === 'api_key' && endpoint.auth_config.header) {
      const apiKey = process.env[`${endpoint.name.toUpperCase()}_API_KEY`];
      if (apiKey) {
        headers[endpoint.auth_config.header] = `${endpoint.auth_config.prefix || ''} ${apiKey}`.trim();
      }
    }

    return headers;
  }

  // Make HTTP request with retries and error handling
  async makeRequest(endpoint, options = {}) {
    const { userId, queryParams = {}, body = null, skipCache = false } = options;
    
    // Check rate limits
    await this.checkRateLimit(endpoint.provider_id, userId);
    
    // Build URL
    const url = `${endpoint.base_url}${endpoint.path}`;
    const fullUrl = new URL(url);
    
    // Add query parameters
    Object.keys({ ...endpoint.query_params, ...queryParams }).forEach(key => {
      fullUrl.searchParams.append(key, { ...endpoint.query_params, ...queryParams }[key]);
    });
    
    // Check cache first (for GET requests)
    const cacheKey = `api_cache:${endpoint.id}:${fullUrl.toString()}:${userId || 'global'}`;
    if (endpoint.method === 'GET' && !skipCache) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const cachedData = JSON.parse(cached);
          await this.logRequest(endpoint.id, userId, endpoint.method, fullUrl.toString(), {}, queryParams, body, 200, 0);
          return {
            success: true,
            data: cachedData,
            cached: true,
            source: 'cache'
          };
        }
      } catch (cacheError) {
        console.error('Cache read error:', cacheError);
      }
    }
    
    // Build headers with authentication
    const headers = await this.buildHeaders(endpoint, userId);
    
    const startTime = Date.now();
    let attempt = 1;
    
    while (attempt <= (endpoint.retry_attempts || this.defaultConfig.retryAttempts)) {
      try {
        // Make the request
        const response = await axios({
          method: endpoint.method || 'GET',
          url: fullUrl.toString(),
          headers,
          data: body || endpoint.body_template,
          timeout: endpoint.timeout_seconds * 1000 || this.defaultConfig.timeout,
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });
        
        const responseTime = Date.now() - startTime;
        
        // Log the request
        await this.logRequest(
          endpoint.id, userId, endpoint.method, fullUrl.toString(),
          headers, queryParams, body, response.status, responseTime
        );
        
        // Store raw response
        const rawResponseId = await this.storeRawResponse(
          endpoint.id, userId, response.status, response.headers, response.data, responseTime
        );
        
        if (response.status >= 400) {
          await this.logError(
            endpoint.id, userId, 'http_error',
            `HTTP ${response.status}: ${response.statusText}`,
            { response: response.data, headers: response.headers },
            null, response.status >= 500 ? 'high' : 'medium'
          );
          
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
            data: response.data
          };
        }
        
        // Cache successful GET responses
        if (endpoint.method === 'GET' && response.status === 200) {
          try {
            await this.redis.setex(cacheKey, this.defaultConfig.maxCacheAge, JSON.stringify(response.data));
          } catch (cacheError) {
            console.error('Cache write error:', cacheError);
          }
        }
        
        return {
          success: true,
          data: response.data,
          rawResponseId,
          status: response.status,
          headers: response.headers,
          responseTime,
          cached: false,
          source: 'api'
        };
        
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        // Log the failed request
        await this.logRequest(
          endpoint.id, userId, endpoint.method, fullUrl.toString(),
          headers, queryParams, body, 0, responseTime, error.message, attempt - 1
        );
        
        if (attempt === (endpoint.retry_attempts || this.defaultConfig.retryAttempts)) {
          // Final attempt failed, log error
          await this.logError(
            endpoint.id, userId, 'request_failed', error.message,
            { url: fullUrl.toString(), attempt, error: error.stack },
            error.stack, 'high'
          );
          
          return {
            success: false,
            error: error.message,
            attempts: attempt,
            responseTime
          };
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.defaultConfig.retryDelay * attempt));
        attempt++;
      }
    }
  }

  // Transform and normalize API response data
  async transformData(rawData, endpoint, userId = null) {
    try {
      const mapping = endpoint.response_mapping || {};
      let normalizedData;
      
      if (Array.isArray(rawData)) {
        normalizedData = rawData.map(item => this.applyMapping(item, mapping));
      } else {
        normalizedData = this.applyMapping(rawData, mapping);
      }
      
      // Store processed data
      const processedId = await this.storeProcessedData(
        null, endpoint.id, userId, endpoint.data_type, normalizedData,
        { transformation_applied: true, mapping_version: '1.0' }
      );
      
      return {
        success: true,
        data: normalizedData,
        processedId,
        recordCount: Array.isArray(normalizedData) ? normalizedData.length : 1
      };
      
    } catch (error) {
      await this.logError(
        endpoint.id, userId, 'transformation_error', error.message,
        { raw_data: rawData, mapping: endpoint.response_mapping },
        error.stack, 'medium'
      );
      
      return {
        success: false,
        error: error.message,
        rawData
      };
    }
  }

  // Apply JSON path mapping to transform data
  applyMapping(data, mapping) {
    const result = {};
    
    for (const [key, path] of Object.entries(mapping)) {
      try {
        result[key] = this.getValueByPath(data, path);
      } catch (error) {
        console.warn(`Failed to map ${key} using path ${path}:`, error.message);
        result[key] = null;
      }
    }
    
    return Object.keys(result).length > 0 ? result : data;
  }

  // Simple JSON path resolver (supports $.field and $.nested.field)
  getValueByPath(data, path) {
    if (!path || !path.startsWith('$.')) {
      return data;
    }
    
    const keys = path.substring(2).split('.');
    let current = data;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  // Database helper methods
  async getProviderById(providerId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM api.providers WHERE id = $1', [providerId]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async logRequest(endpointId, userId, method, url, headers, queryParams, body, statusCode, responseTime, errorMessage = null, retryCount = 0) {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT api.log_request($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [
        endpointId, userId, method, url, JSON.stringify(headers), JSON.stringify(queryParams),
        JSON.stringify(body), statusCode, responseTime, errorMessage, retryCount
      ]);
    } catch (error) {
      console.error('Failed to log request:', error);
    } finally {
      client.release();
    }
  }

  async storeRawResponse(endpointId, userId, statusCode, headers, responseData, processingTime) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT api.store_raw_response($1, $2, $3, $4, $5, $6)', [
        endpointId, userId, statusCode, JSON.stringify(headers), JSON.stringify(responseData), processingTime
      ]);
      return result.rows[0].store_raw_response;
    } catch (error) {
      console.error('Failed to store raw response:', error);
      return null;
    } finally {
      client.release();
    }
  }

  async storeProcessedData(rawResponseId, endpointId, userId, dataType, normalizedData, metadata) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT api.store_processed_data($1, $2, $3, $4, $5, $6)', [
        rawResponseId, endpointId, userId, dataType, JSON.stringify(normalizedData), JSON.stringify(metadata)
      ]);
      return result.rows[0].store_processed_data;
    } catch (error) {
      console.error('Failed to store processed data:', error);
      return null;
    } finally {
      client.release();
    }
  }

  async logError(endpointId, userId, errorType, errorMessage, errorDetails, stackTrace, severity = 'medium') {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT api.log_error($1, $2, $3, $4, $5, $6, $7)', [
        endpointId, userId, errorType, errorMessage, JSON.stringify(errorDetails), stackTrace, severity
      ]);
    } catch (error) {
      console.error('Failed to log error:', error);
    } finally {
      client.release();
    }
  }

  // High-level API methods
  async fetchData(providerName, endpointName, options = {}) {
    try {
      const endpoint = await this.getEndpoint(providerName, endpointName);
      if (!endpoint) {
        throw new Error(`Endpoint ${endpointName} not found for provider ${providerName}`);
      }
      
      // Make request
      const response = await this.makeRequest(endpoint, options);
      if (!response.success) {
        return response;
      }
      
      // Transform data if needed
      if (endpoint.response_mapping && Object.keys(endpoint.response_mapping).length > 0) {
        const transformResult = await this.transformData(response.data, endpoint, options.userId);
        return {
          ...response,
          transformedData: transformResult.data,
          processedId: transformResult.processedId
        };
      }
      
      return response;
    } catch (error) {
      console.error(`API fetch error for ${providerName}/${endpointName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get cached data
  async getCachedData(key) {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // Set cached data
  async setCachedData(key, data, ttl = 300) {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  // Health check
  async healthCheck() {
    const results = {};
    
    try {
      // Check database
      const dbClient = await this.pool.connect();
      await dbClient.query('SELECT 1');
      dbClient.release();
      results.database = 'healthy';
    } catch (error) {
      results.database = `unhealthy: ${error.message}`;
    }
    
    try {
      // Check Redis
      await this.redis.ping();
      results.redis = 'healthy';
    } catch (error) {
      results.redis = `unhealthy: ${error.message}`;
    }
    
    return results;
  }

  // Cleanup method
  async close() {
    await this.pool.end();
    await this.redis.quit();
  }
}

module.exports = new ExternalAPIClient();
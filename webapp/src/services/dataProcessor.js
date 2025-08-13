const { Pool } = require('pg');
const apiClient = require('./apiClient');
const auditLogger = require('./auditLogger');

class DataProcessor {
  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || 'sitetemplate',
      user: process.env.POSTGRES_USER || 'admin',
      password: process.env.POSTGRES_PASSWORD || 'password',
      ssl: false,
    });

    // Data validation rules
    this.validationRules = {
      users: {
        required: ['id', 'name', 'email'],
        types: {
          id: 'number',
          name: 'string',
          email: 'string'
        },
        patterns: {
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        }
      },
      posts: {
        required: ['id', 'title', 'userId'],
        types: {
          id: 'number',
          title: 'string',
          userId: 'number'
        }
      },
      transactions: {
        required: ['id', 'amount', 'currency'],
        types: {
          id: 'number',
          amount: 'number',
          currency: 'string'
        },
        ranges: {
          amount: { min: 0, max: 1000000 }
        }
      }
    };

    // Data normalization schemas
    this.normalizationSchemas = {
      users: {
        id: { type: 'integer', source: 'id' },
        full_name: { type: 'string', source: 'name', transform: 'trim' },
        email_address: { type: 'string', source: 'email', transform: 'lowercase' },
        company_name: { type: 'string', source: 'company', default: null },
        phone_number: { type: 'string', source: 'phone', transform: 'phone_format' },
        address: {
          type: 'object',
          source: 'address',
          schema: {
            street: { type: 'string', source: 'street' },
            city: { type: 'string', source: 'city' },
            zipcode: { type: 'string', source: 'zipcode' }
          }
        },
        created_at: { type: 'timestamp', auto: true },
        updated_at: { type: 'timestamp', auto: true }
      },
      posts: {
        id: { type: 'integer', source: 'id' },
        title: { type: 'string', source: 'title', transform: 'trim' },
        content: { type: 'text', source: 'body', transform: 'sanitize' },
        author_id: { type: 'integer', source: 'userId' },
        word_count: { type: 'integer', computed: 'count_words' },
        published_at: { type: 'timestamp', auto: true },
        updated_at: { type: 'timestamp', auto: true }
      },
      transactions: {
        id: { type: 'integer', source: 'id' },
        amount_cents: { type: 'integer', source: 'amount', transform: 'to_cents' },
        currency_code: { type: 'string', source: 'currency', transform: 'uppercase' },
        transaction_date: { type: 'date', source: 'date', transform: 'parse_date' },
        status: { type: 'string', default: 'pending' },
        created_at: { type: 'timestamp', auto: true },
        updated_at: { type: 'timestamp', auto: true }
      }
    };
  }

  // Main data processing pipeline
  async processData(rawData, dataType, endpointId, userId = null) {
    const startTime = Date.now();
    const results = {
      processed: 0,
      errors: 0,
      duplicates: 0,
      invalid: 0,
      details: []
    };

    try {
      // Ensure data is an array for consistent processing
      const dataArray = Array.isArray(rawData) ? rawData : [rawData];
      
      for (const item of dataArray) {
        try {
          // Step 1: Validate data
          const validation = this.validateData(item, dataType);
          if (!validation.valid) {
            results.invalid++;
            results.details.push({
              item,
              error: 'validation_failed',
              details: validation.errors
            });
            continue;
          }

          // Step 2: Normalize data
          const normalized = this.normalizeData(item, dataType);
          
          // Step 3: Check for duplicates
          const isDuplicate = await this.checkDuplicate(normalized, dataType, userId);
          if (isDuplicate) {
            results.duplicates++;
            continue;
          }

          // Step 4: Store processed data
          const processedId = await this.storeNormalizedData(
            normalized, dataType, endpointId, userId
          );

          if (processedId) {
            results.processed++;
            
            // Log successful processing
            await auditLogger.logDataAccess(
              userId, 'processed_data', processedId, 'create',
              { data_type: dataType, endpoint_id: endpointId }
            );
          }

        } catch (itemError) {
          results.errors++;
          results.details.push({
            item,
            error: itemError.message,
            stack: itemError.stack
          });
          
          await apiClient.logError(
            endpointId, userId, 'processing_error', itemError.message,
            { item, data_type: dataType }, itemError.stack, 'medium'
          );
        }
      }

      // Update data quality metrics
      await this.updateDataQualityMetrics(endpointId, dataType, results);

      const processingTime = Date.now() - startTime;
      
      return {
        success: true,
        ...results,
        processingTime,
        qualityScore: this.calculateQualityScore(results)
      };

    } catch (error) {
      console.error('Data processing pipeline error:', error);
      await apiClient.logError(
        endpointId, userId, 'pipeline_error', error.message,
        { data_type: dataType, raw_data: rawData }, error.stack, 'high'
      );
      
      return {
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  // Validate data against rules
  validateData(data, dataType) {
    const rules = this.validationRules[dataType];
    if (!rules) {
      return { valid: true, errors: [] };
    }

    const errors = [];

    // Check required fields
    if (rules.required) {
      for (const field of rules.required) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Check data types
    if (rules.types) {
      for (const [field, expectedType] of Object.entries(rules.types)) {
        if (data[field] !== undefined && data[field] !== null) {
          const actualType = typeof data[field];
          if (expectedType === 'number' && isNaN(data[field])) {
            errors.push(`Field ${field} must be a valid number`);
          } else if (expectedType !== 'number' && actualType !== expectedType) {
            errors.push(`Field ${field} must be of type ${expectedType}, got ${actualType}`);
          }
        }
      }
    }

    // Check patterns (e.g., email format)
    if (rules.patterns) {
      for (const [field, pattern] of Object.entries(rules.patterns)) {
        if (data[field] && !pattern.test(data[field])) {
          errors.push(`Field ${field} does not match required pattern`);
        }
      }
    }

    // Check value ranges
    if (rules.ranges) {
      for (const [field, range] of Object.entries(rules.ranges)) {
        if (data[field] !== undefined) {
          const value = parseFloat(data[field]);
          if (!isNaN(value)) {
            if (range.min !== undefined && value < range.min) {
              errors.push(`Field ${field} must be >= ${range.min}`);
            }
            if (range.max !== undefined && value > range.max) {
              errors.push(`Field ${field} must be <= ${range.max}`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Normalize data according to schema
  normalizeData(data, dataType) {
    const schema = this.normalizationSchemas[dataType];
    if (!schema) {
      return data; // Return as-is if no schema defined
    }

    const normalized = {};
    const now = new Date().toISOString();

    for (const [targetField, config] of Object.entries(schema)) {
      try {
        let value;

        if (config.auto) {
          // Auto-generated fields
          value = now;
        } else if (config.computed) {
          // Computed fields
          value = this.computeValue(data, config.computed);
        } else if (config.source) {
          // Source mapping
          value = this.getNestedValue(data, config.source);
          
          // Apply transformations
          if (value !== undefined && config.transform) {
            value = this.transformValue(value, config.transform);
          }
        } else if (config.default !== undefined) {
          // Default value
          value = config.default;
        }

        // Type conversion
        if (value !== undefined && value !== null) {
          value = this.convertType(value, config.type);
        }

        // Handle nested objects
        if (config.type === 'object' && config.schema && value) {
          value = this.normalizeNestedObject(value, config.schema);
        }

        normalized[targetField] = value;

      } catch (error) {
        console.warn(`Error normalizing field ${targetField}:`, error.message);
        normalized[targetField] = config.default || null;
      }
    }

    return normalized;
  }

  // Get nested value from object using dot notation
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  // Transform value based on transformation type
  transformValue(value, transform) {
    switch (transform) {
      case 'trim':
        return typeof value === 'string' ? value.trim() : value;
      
      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value;
      
      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value;
      
      case 'sanitize':
        return typeof value === 'string' ? value.replace(/<[^>]*>/g, '') : value;
      
      case 'phone_format':
        return typeof value === 'string' ? value.replace(/\D/g, '') : value;
      
      case 'to_cents':
        const num = parseFloat(value);
        return isNaN(num) ? 0 : Math.round(num * 100);
      
      case 'parse_date':
        return new Date(value).toISOString();
      
      default:
        return value;
    }
  }

  // Compute derived values
  computeValue(data, computation) {
    switch (computation) {
      case 'count_words':
        const text = data.body || data.content || '';
        return typeof text === 'string' ? text.split(/\s+/).filter(word => word.length > 0).length : 0;
      
      default:
        return null;
    }
  }

  // Convert value to target type
  convertType(value, type) {
    switch (type) {
      case 'integer':
        const int = parseInt(value);
        return isNaN(int) ? null : int;
      
      case 'number':
        const num = parseFloat(value);
        return isNaN(num) ? null : num;
      
      case 'string':
        return String(value);
      
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
        }
        return Boolean(value);
      
      case 'timestamp':
      case 'date':
        return new Date(value).toISOString();
      
      default:
        return value;
    }
  }

  // Normalize nested object
  normalizeNestedObject(obj, schema) {
    const normalized = {};
    
    for (const [field, config] of Object.entries(schema)) {
      let value = obj[config.source] || config.default;
      
      if (value !== undefined && config.transform) {
        value = this.transformValue(value, config.transform);
      }
      
      if (value !== undefined) {
        value = this.convertType(value, config.type);
      }
      
      normalized[field] = value;
    }
    
    return normalized;
  }

  // Check for duplicate data
  async checkDuplicate(normalizedData, dataType, userId) {
    const client = await this.pool.connect();
    try {
      // Create a simple hash for duplicate detection
      const hashData = JSON.stringify(normalizedData);
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(hashData).digest('hex');
      
      const result = await client.query(`
        SELECT id FROM api.processed_data
        WHERE data_hash = $1 AND data_type = $2 AND user_id = $3
        AND valid_to IS NULL
        LIMIT 1
      `, [hash, dataType, userId]);
      
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking duplicates:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // Store normalized data
  async storeNormalizedData(normalizedData, dataType, endpointId, userId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT api.store_processed_data($1, $2, $3, $4, $5, $6)',
        [null, endpointId, userId, dataType, JSON.stringify(normalizedData), JSON.stringify({
          normalized: true,
          schema_version: '1.0',
          processed_at: new Date().toISOString()
        })]
      );
      
      return result.rows[0].store_processed_data;
    } catch (error) {
      console.error('Error storing normalized data:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Update data quality metrics
  async updateDataQualityMetrics(endpointId, dataType, results) {
    const client = await this.pool.connect();
    try {
      const total = results.processed + results.errors + results.invalid + results.duplicates;
      const qualityScore = total > 0 ? ((results.processed / total) * 100) : 0;
      
      await client.query(`
        INSERT INTO api.data_quality_metrics (
          endpoint_id, data_type, metric_date, total_records, valid_records,
          invalid_records, duplicate_records, quality_score
        ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7)
        ON CONFLICT (endpoint_id, data_type, metric_date)
        DO UPDATE SET
          total_records = EXCLUDED.total_records + api.data_quality_metrics.total_records,
          valid_records = EXCLUDED.valid_records + api.data_quality_metrics.valid_records,
          invalid_records = EXCLUDED.invalid_records + api.data_quality_metrics.invalid_records,
          duplicate_records = EXCLUDED.duplicate_records + api.data_quality_metrics.duplicate_records,
          quality_score = (EXCLUDED.valid_records::decimal / EXCLUDED.total_records * 100)
      `, [endpointId, dataType, total, results.processed, results.invalid, results.duplicates, qualityScore]);
      
    } catch (error) {
      console.error('Error updating data quality metrics:', error);
    } finally {
      client.release();
    }
  }

  // Calculate quality score
  calculateQualityScore(results) {
    const total = results.processed + results.errors + results.invalid + results.duplicates;
    if (total === 0) return 100;
    
    const successful = results.processed;
    return Math.round((successful / total) * 100);
  }

  // Get processed data with filtering and pagination
  async getProcessedData(options = {}) {
    const {
      dataType,
      userId,
      limit = 50,
      offset = 0,
      startDate,
      endDate,
      includeMetadata = false
    } = options;

    const client = await this.pool.connect();
    try {
      let query = `
        SELECT id, data_type, normalized_data, created_at, updated_at
        ${includeMetadata ? ', metadata' : ''}
        FROM api.processed_data
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;

      if (dataType) {
        query += ` AND data_type = $${paramIndex++}`;
        params.push(dataType);
      }

      if (userId) {
        query += ` AND user_id = $${paramIndex++}`;
        params.push(userId);
      }

      if (startDate) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await client.query(query, params);
      
      return {
        success: true,
        data: result.rows,
        count: result.rows.length,
        hasMore: result.rows.length === limit
      };

    } catch (error) {
      console.error('Error getting processed data:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Get data quality metrics
  async getDataQualityMetrics(endpointId, dataType, days = 7) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT * FROM api.data_quality_metrics
        WHERE endpoint_id = $1 AND data_type = $2
        AND metric_date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY metric_date DESC
      `, [endpointId, dataType]);
      
      return {
        success: true,
        metrics: result.rows
      };

    } catch (error) {
      console.error('Error getting data quality metrics:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Health check
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message 
      };
    }
  }

  // Cleanup method
  async close() {
    await this.pool.end();
  }
}

module.exports = new DataProcessor();
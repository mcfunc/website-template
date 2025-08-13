const { Pool } = require('pg');
const Redis = require('ioredis');

class ABTestingService {
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

    // Redis for caching assignments
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.redis.on('error', (err) => {
      console.error('AB Testing Redis error:', err);
    });

    // Cache for test configurations
    this.testCache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
  }

  // Test Management
  async getActiveTests() {
    const cacheKey = 'active_tests';
    
    // Check cache first
    if (this.testCache.has(cacheKey)) {
      const cached = this.testCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return { success: true, data: cached.data };
      }
    }

    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          t.*,
          json_agg(
            json_build_object(
              'id', v.id,
              'name', v.name,
              'display_name', v.display_name,
              'is_control', v.is_control,
              'traffic_weight', v.traffic_weight,
              'configuration', v.configuration
            ) ORDER BY v.created_at
          ) as variants
        FROM admin.ab_tests t
        LEFT JOIN admin.ab_test_variants v ON t.id = v.test_id
        WHERE t.status = 'active'
        AND (t.start_date IS NULL OR t.start_date <= NOW())
        AND (t.end_date IS NULL OR t.end_date >= NOW())
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `;

      const result = await client.query(query);
      
      // Cache the results
      this.testCache.set(cacheKey, {
        data: result.rows,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('Get active tests error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getTestByName(testName) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          t.*,
          json_agg(
            json_build_object(
              'id', v.id,
              'name', v.name,
              'display_name', v.display_name,
              'is_control', v.is_control,
              'traffic_weight', v.traffic_weight,
              'configuration', v.configuration
            ) ORDER BY v.created_at
          ) as variants
        FROM admin.ab_tests t
        LEFT JOIN admin.ab_test_variants v ON t.id = v.test_id
        WHERE t.name = $1
        GROUP BY t.id
      `;

      const result = await client.query(query, [testName]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Test not found'
        };
      }

      return {
        success: true,
        data: result.rows[0]
      };
    } catch (error) {
      console.error('Get test by name error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Variant Assignment
  async assignUserToTest(testName, userId = null, sessionId = null) {
    if (!userId && !sessionId) {
      return {
        success: false,
        error: 'Either userId or sessionId must be provided'
      };
    }

    // Check Redis cache first
    const cacheKey = userId ? `test_assignment:${testName}:user:${userId}` : `test_assignment:${testName}:session:${sessionId}`;
    const cachedAssignment = await this.redis.get(cacheKey);
    
    if (cachedAssignment) {
      return {
        success: true,
        data: JSON.parse(cachedAssignment)
      };
    }

    const client = await this.pool.connect();
    
    try {
      // Get test details
      const testQuery = 'SELECT id, status, traffic_allocation FROM admin.ab_tests WHERE name = $1';
      const testResult = await client.query(testQuery, [testName]);
      
      if (testResult.rows.length === 0) {
        return {
          success: false,
          error: 'Test not found'
        };
      }

      const test = testResult.rows[0];
      
      if (test.status !== 'active') {
        return {
          success: false,
          error: 'Test is not active'
        };
      }

      // Check if user should be included in test based on traffic allocation
      const random = Math.random() * 100;
      if (random > test.traffic_allocation) {
        return {
          success: true,
          data: {
            testId: test.id,
            testName: testName,
            variant: null,
            excluded: true,
            reason: 'traffic_allocation'
          }
        };
      }

      // Use database function to assign variant
      const assignmentQuery = 'SELECT admin.assign_ab_test_variant($1, $2, $3) as variant_id';
      const assignmentResult = await client.query(assignmentQuery, [test.id, userId, sessionId]);
      
      const variantId = assignmentResult.rows[0].variant_id;

      // Get variant details
      const variantQuery = `
        SELECT v.*, t.name as test_name
        FROM admin.ab_test_variants v
        JOIN admin.ab_tests t ON v.test_id = t.id
        WHERE v.id = $1
      `;
      const variantResult = await client.query(variantQuery, [variantId]);
      
      if (variantResult.rows.length === 0) {
        return {
          success: false,
          error: 'Variant not found'
        };
      }

      const variant = variantResult.rows[0];
      const assignmentData = {
        testId: test.id,
        testName: testName,
        variantId: variant.id,
        variantName: variant.name,
        isControl: variant.is_control,
        configuration: variant.configuration,
        excluded: false
      };

      // Cache assignment for 24 hours
      await this.redis.setEx(cacheKey, 86400, JSON.stringify(assignmentData));

      return {
        success: true,
        data: assignmentData
      };
    } catch (error) {
      console.error('Assign user to test error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async getUserTestAssignments(userId = null, sessionId = null) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          t.name as test_name,
          t.display_name as test_display_name,
          v.name as variant_name,
          v.display_name as variant_display_name,
          v.is_control,
          v.configuration,
          a.assigned_at
        FROM admin.ab_test_assignments a
        JOIN admin.ab_tests t ON a.test_id = t.id
        JOIN admin.ab_test_variants v ON a.variant_id = v.id
        WHERE ${userId ? 'a.user_id = $1' : 'a.session_id = $1'}
        AND t.status = 'active'
        ORDER BY a.assigned_at DESC
      `;

      const result = await client.query(query, [userId || sessionId]);

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('Get user test assignments error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Results Recording
  async recordTestResult(testName, variantName, userId, sessionId, metricName, metricValue, metricType = 'conversion') {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO admin.ab_test_results (
          test_id, variant_id, user_id, session_id, 
          metric_name, metric_value, metric_type
        )
        SELECT 
          t.id, v.id, $3, $4, $5, $6, $7
        FROM admin.ab_tests t
        JOIN admin.ab_test_variants v ON t.id = v.test_id
        WHERE t.name = $1 AND v.name = $2
        RETURNING id
      `;

      const values = [
        testName, variantName, userId, sessionId,
        metricName, metricValue, metricType
      ];

      const result = await client.query(query, values);

      // Also update Redis for real-time tracking
      const redisKey = `test_results:${testName}:${variantName}:${metricName}`;
      await this.redis.lPush(redisKey, JSON.stringify({
        value: metricValue,
        userId,
        sessionId,
        timestamp: new Date()
      }));
      await this.redis.lTrim(redisKey, 0, 999); // Keep last 1000 results
      await this.redis.expire(redisKey, 86400 * 7); // Expire after 7 days

      return {
        success: true,
        resultId: result.rows[0].id
      };
    } catch (error) {
      console.error('Record test result error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Analytics and Reporting
  async getTestResults(testName, startDate = null, endDate = null) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          v.name as variant_name,
          v.display_name as variant_display_name,
          v.is_control,
          r.metric_name,
          r.metric_type,
          COUNT(*) as sample_size,
          AVG(r.metric_value) as mean_value,
          STDDEV_POP(r.metric_value) as std_dev,
          MIN(r.metric_value) as min_value,
          MAX(r.metric_value) as max_value,
          SUM(CASE WHEN r.metric_value > 0 THEN 1 ELSE 0 END) as conversions,
          COUNT(*) as total_events,
          SUM(CASE WHEN r.metric_value > 0 THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) * 100 as conversion_rate
        FROM admin.ab_tests t
        JOIN admin.ab_test_variants v ON t.id = v.test_id
        LEFT JOIN admin.ab_test_results r ON v.id = r.variant_id
        WHERE t.name = $1
        ${startDate ? 'AND r.recorded_at >= $2' : ''}
        ${endDate ? 'AND r.recorded_at <= $' + (startDate ? '3' : '2') : ''}
        GROUP BY v.id, v.name, v.display_name, v.is_control, r.metric_name, r.metric_type
        ORDER BY v.is_control DESC, v.name, r.metric_name
      `;

      const values = [testName];
      if (startDate) values.push(startDate);
      if (endDate) values.push(endDate);

      const result = await client.query(query, values);

      // Group results by variant and metric
      const groupedResults = {};
      result.rows.forEach(row => {
        const key = `${row.variant_name}`;
        if (!groupedResults[key]) {
          groupedResults[key] = {
            variant_name: row.variant_name,
            variant_display_name: row.variant_display_name,
            is_control: row.is_control,
            metrics: {}
          };
        }
        
        if (row.metric_name) {
          groupedResults[key].metrics[row.metric_name] = {
            metric_type: row.metric_type,
            sample_size: parseInt(row.sample_size),
            mean_value: parseFloat(row.mean_value || 0),
            std_dev: parseFloat(row.std_dev || 0),
            min_value: parseFloat(row.min_value || 0),
            max_value: parseFloat(row.max_value || 0),
            conversions: parseInt(row.conversions || 0),
            total_events: parseInt(row.total_events || 0),
            conversion_rate: parseFloat(row.conversion_rate || 0)
          };
        }
      });

      return {
        success: true,
        data: {
          test_name: testName,
          results: Object.values(groupedResults),
          date_range: {
            start: startDate,
            end: endDate
          }
        }
      };
    } catch (error) {
      console.error('Get test results error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  async calculateStatisticalSignificance(testName, metricName = 'conversion') {
    const client = await this.pool.connect();
    
    try {
      // Get control and treatment results
      const query = `
        SELECT 
          v.name as variant_name,
          v.is_control,
          COUNT(*) as sample_size,
          AVG(r.metric_value) as mean_value,
          STDDEV_POP(r.metric_value) as std_dev,
          SUM(CASE WHEN r.metric_value > 0 THEN 1 ELSE 0 END) as conversions
        FROM admin.ab_tests t
        JOIN admin.ab_test_variants v ON t.id = v.test_id
        JOIN admin.ab_test_results r ON v.id = r.variant_id
        WHERE t.name = $1 AND r.metric_name = $2
        GROUP BY v.id, v.name, v.is_control
        ORDER BY v.is_control DESC
      `;

      const result = await client.query(query, [testName, metricName]);
      
      if (result.rows.length < 2) {
        return {
          success: false,
          error: 'Not enough variants for statistical analysis'
        };
      }

      const control = result.rows.find(r => r.is_control);
      const treatments = result.rows.filter(r => !r.is_control);

      if (!control) {
        return {
          success: false,
          error: 'No control variant found'
        };
      }

      const results = treatments.map(treatment => {
        // Basic statistical significance calculation
        const controlRate = control.conversions / control.sample_size;
        const treatmentRate = treatment.conversions / treatment.sample_size;
        const lift = ((treatmentRate - controlRate) / controlRate) * 100;
        
        // Simplified z-test calculation
        const pooledRate = (control.conversions + treatment.conversions) / 
                          (control.sample_size + treatment.sample_size);
        const standardError = Math.sqrt(
          pooledRate * (1 - pooledRate) * 
          (1 / control.sample_size + 1 / treatment.sample_size)
        );
        
        const zScore = (treatmentRate - controlRate) / standardError;
        const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
        const isSignificant = pValue < 0.05;
        const confidenceLevel = (1 - pValue) * 100;

        return {
          variant_name: treatment.variant_name,
          control_rate: controlRate,
          treatment_rate: treatmentRate,
          lift_percentage: lift,
          z_score: zScore,
          p_value: pValue,
          is_significant: isSignificant,
          confidence_level: confidenceLevel,
          control_sample_size: parseInt(control.sample_size),
          treatment_sample_size: parseInt(treatment.sample_size)
        };
      });

      return {
        success: true,
        data: {
          test_name: testName,
          metric_name: metricName,
          control_variant: control.variant_name,
          statistical_analysis: results
        }
      };
    } catch (error) {
      console.error('Calculate statistical significance error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Helper function for normal cumulative distribution function
  normalCDF(x) {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  // Error function approximation
  erf(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  // Test Management (Admin Functions)
  async createTest(testData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create test
      const testQuery = `
        INSERT INTO admin.ab_tests (
          name, display_name, description, hypothesis, test_type, 
          traffic_allocation, success_metrics, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      const testValues = [
        testData.name,
        testData.display_name,
        testData.description || null,
        testData.hypothesis || null,
        testData.test_type || 'split',
        testData.traffic_allocation || 100,
        JSON.stringify(testData.success_metrics),
        testData.created_by
      ];

      const testResult = await client.query(testQuery, testValues);
      const testId = testResult.rows[0].id;

      // Create variants
      for (const variant of testData.variants) {
        const variantQuery = `
          INSERT INTO admin.ab_test_variants (
            test_id, name, display_name, description, 
            is_control, traffic_weight, configuration
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        const variantValues = [
          testId,
          variant.name,
          variant.display_name,
          variant.description || null,
          variant.is_control || false,
          variant.traffic_weight,
          JSON.stringify(variant.configuration || {})
        ];

        await client.query(variantQuery, variantValues);
      }

      await client.query('COMMIT');

      // Clear cache
      this.testCache.clear();

      return {
        success: true,
        testId: testId
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create test error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Health Check
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1 FROM admin.ab_tests LIMIT 1');
      client.release();

      const redisHealth = await this.redis.ping();

      return {
        status: 'healthy',
        database: 'connected',
        redis: redisHealth === 'PONG' ? 'connected' : 'disconnected',
        cache_size: this.testCache.size
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
    this.testCache.clear();
  }
}

module.exports = new ABTestingService();
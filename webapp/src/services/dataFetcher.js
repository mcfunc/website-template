const cron = require('node-cron');
const { Pool } = require('pg');
const apiClient = require('./apiClient');
const dataProcessor = require('./dataProcessor');
const cacheManager = require('./cacheManager');
const auditLogger = require('./auditLogger');

class AutomatedDataFetcher {
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

    // Job scheduler state
    this.jobs = new Map();
    this.isRunning = false;
    this.metrics = {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      lastRun: null,
      averageRunTime: 0
    };

    // Default fetch schedules
    this.schedules = {
      'every_minute': '* * * * *',
      'every_5_minutes': '*/5 * * * *',
      'every_15_minutes': '*/15 * * * *',
      'every_30_minutes': '*/30 * * * *',
      'hourly': '0 * * * *',
      'every_6_hours': '0 */6 * * *',
      'daily': '0 0 * * *',
      'weekly': '0 0 * * 0'
    };

    // Queue for batch processing
    this.fetchQueue = [];
    this.processing = false;
    this.batchSize = 5;
    this.batchInterval = 10000; // 10 seconds

    this.setupPeriodicTasks();
  }

  // Initialize automated fetching
  async initialize() {
    console.log('Initializing Automated Data Fetcher...');
    
    try {
      await this.loadFetchConfigurations();
      await this.startBatchProcessor();
      this.isRunning = true;
      
      console.log('Automated Data Fetcher initialized successfully');
      return { success: true };
    } catch (error) {
      console.error('Failed to initialize Automated Data Fetcher:', error);
      return { success: false, error: error.message };
    }
  }

  // Load fetch configurations from database
  async loadFetchConfigurations() {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          e.id as endpoint_id,
          e.name as endpoint_name,
          e.data_type,
          e.active,
          p.name as provider_name,
          p.rate_limit_requests,
          p.rate_limit_window,
          COALESCE(fc.schedule, 'hourly') as schedule,
          COALESCE(fc.enabled, true) as enabled,
          fc.last_run,
          fc.next_run
        FROM api.endpoints e
        JOIN api.providers p ON e.provider_id = p.id
        LEFT JOIN api.fetch_configs fc ON e.id = fc.endpoint_id
        WHERE e.active = true AND p.active = true
      `);

      for (const config of result.rows) {
        if (config.enabled) {
          this.scheduleJob(config);
        }
      }

      console.log(`Loaded ${result.rows.length} fetch configurations`);
    } catch (error) {
      console.error('Error loading fetch configurations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Schedule a data fetching job
  scheduleJob(config) {
    const cronPattern = this.schedules[config.schedule] || config.schedule;
    
    if (!cron.validate(cronPattern)) {
      console.error(`Invalid cron pattern for ${config.endpoint_name}: ${cronPattern}`);
      return;
    }

    const jobId = `${config.provider_name}_${config.endpoint_name}`;
    
    // Cancel existing job if any
    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId).destroy();
    }

    const job = cron.schedule(cronPattern, async () => {
      await this.executeFetchJob(config);
    }, {
      scheduled: false
    });

    this.jobs.set(jobId, job);
    job.start();

    console.log(`Scheduled job ${jobId} with pattern: ${cronPattern}`);
  }

  // Execute a single fetch job
  async executeFetchJob(config) {
    const startTime = Date.now();
    const jobId = `${config.provider_name}_${config.endpoint_name}`;
    
    try {
      console.log(`Executing fetch job: ${jobId}`);
      
      // Update metrics
      this.metrics.totalJobs++;
      this.metrics.lastRun = new Date().toISOString();

      // Get users who need data for this endpoint
      const users = await this.getUsersForEndpoint(config.endpoint_id);
      
      const results = {
        users: users.length,
        successful: 0,
        failed: 0,
        totalRecords: 0,
        errors: []
      };

      // Process each user (with rate limiting)
      for (const user of users) {
        try {
          const userResult = await this.fetchUserData(config, user);
          
          if (userResult.success) {
            results.successful++;
            results.totalRecords += userResult.recordCount || 0;
          } else {
            results.failed++;
            results.errors.push({
              userId: user.id,
              error: userResult.error
            });
          }

          // Add delay to respect rate limits
          if (config.rate_limit_requests && users.length > 1) {
            const delay = Math.ceil((config.rate_limit_window * 1000) / config.rate_limit_requests);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } catch (userError) {
          results.failed++;
          results.errors.push({
            userId: user.id,
            error: userError.message
          });
        }
      }

      // Update job metrics
      const runTime = Date.now() - startTime;
      this.updateJobMetrics(config.endpoint_id, results, runTime);
      
      if (results.failed === 0) {
        this.metrics.successfulJobs++;
      } else {
        this.metrics.failedJobs++;
      }

      // Update average run time
      this.metrics.averageRunTime = (this.metrics.averageRunTime + runTime) / 2;

      console.log(`Completed fetch job ${jobId}: ${results.successful}/${results.users} users successful, ${results.totalRecords} records, ${runTime}ms`);

      // Log to audit
      await auditLogger.log({
        event_type: 'system',
        action: 'automated_fetch_completed',
        details: {
          job_id: jobId,
          endpoint_id: config.endpoint_id,
          results,
          run_time_ms: runTime
        }
      });

    } catch (error) {
      console.error(`Fetch job ${jobId} failed:`, error);
      this.metrics.failedJobs++;
      
      await apiClient.logError(
        config.endpoint_id, null, 'automated_fetch_failed', error.message,
        { job_id: jobId, config }, error.stack, 'high'
      );
    }
  }

  // Fetch data for a specific user
  async fetchUserData(config, user) {
    try {
      // Check cache first
      const cacheKey = `auto_fetch:${config.endpoint_id}:${user.id}`;
      const cached = await cacheManager.get(cacheKey);
      
      if (cached && cached.fetched_at > Date.now() - (15 * 60 * 1000)) { // 15 minutes
        return {
          success: true,
          cached: true,
          recordCount: cached.recordCount || 0
        };
      }

      // Fetch fresh data
      const response = await apiClient.fetchData(
        config.provider_name, 
        config.endpoint_name,
        { 
          userId: user.id,
          skipCache: false
        }
      );

      if (!response.success) {
        return {
          success: false,
          error: response.error
        };
      }

      // Process the data
      const processResult = await dataProcessor.processData(
        response.data,
        config.data_type,
        config.endpoint_id,
        user.id
      );

      if (!processResult.success) {
        return {
          success: false,
          error: processResult.error
        };
      }

      // Cache the result
      await cacheManager.set(cacheKey, {
        fetched_at: Date.now(),
        recordCount: processResult.processed,
        success: true
      }, 900); // 15 minutes

      return {
        success: true,
        recordCount: processResult.processed,
        qualityScore: processResult.qualityScore
      };

    } catch (error) {
      console.error(`Error fetching data for user ${user.id}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get users who need data for an endpoint
  async getUsersForEndpoint(endpointId) {
    const client = await this.pool.connect();
    try {
      // For now, get all active users with API tokens for this provider
      const result = await client.query(`
        SELECT DISTINCT u.id, u.name, u.email
        FROM auth.users u
        JOIN api.oauth_tokens ot ON u.id = ot.user_id
        JOIN api.endpoints e ON ot.provider_id = e.provider_id
        WHERE e.id = $1 AND u.active = true
        AND (ot.expires_at IS NULL OR ot.expires_at > NOW())
      `, [endpointId]);

      return result.rows;
    } catch (error) {
      console.error('Error getting users for endpoint:', error);
      return [];
    } finally {
      client.release();
    }
  }

  // Update job execution metrics
  async updateJobMetrics(endpointId, results, runTime) {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO api.fetch_metrics (
          endpoint_id, 
          execution_date,
          users_processed,
          successful_fetches,
          failed_fetches,
          total_records,
          average_run_time_ms
        ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
        ON CONFLICT (endpoint_id, execution_date)
        DO UPDATE SET
          users_processed = EXCLUDED.users_processed + api.fetch_metrics.users_processed,
          successful_fetches = EXCLUDED.successful_fetches + api.fetch_metrics.successful_fetches,
          failed_fetches = EXCLUDED.failed_fetches + api.fetch_metrics.failed_fetches,
          total_records = EXCLUDED.total_records + api.fetch_metrics.total_records,
          average_run_time_ms = (EXCLUDED.average_run_time_ms + api.fetch_metrics.average_run_time_ms) / 2,
          updated_at = NOW()
      `, [endpointId, results.users, results.successful, results.failed, results.totalRecords, runTime]);

    } catch (error) {
      console.error('Error updating fetch metrics:', error);
    } finally {
      client.release();
    }
  }

  // Manual data fetch for specific user/endpoint
  async manualFetch(providerName, endpointName, userId, options = {}) {
    try {
      const { forceRefresh = false, processingOptions = {} } = options;
      
      // Get endpoint configuration
      const endpoint = await apiClient.getEndpoint(providerName, endpointName);
      if (!endpoint) {
        throw new Error(`Endpoint ${endpointName} not found for provider ${providerName}`);
      }

      // Fetch data
      const response = await apiClient.fetchData(providerName, endpointName, {
        userId,
        skipCache: forceRefresh
      });

      if (!response.success) {
        return response;
      }

      // Process data
      const processResult = await dataProcessor.processData(
        response.data,
        endpoint.data_type,
        endpoint.id,
        userId
      );

      // Log manual fetch
      await auditLogger.logDataAccess(
        userId, 'manual_fetch', endpoint.id, 'create',
        { 
          provider: providerName, 
          endpoint: endpointName,
          cached: response.cached,
          records_processed: processResult.processed
        }
      );

      return {
        success: true,
        fetchResult: response,
        processResult,
        recordCount: processResult.processed,
        qualityScore: processResult.qualityScore,
        cached: response.cached
      };

    } catch (error) {
      console.error('Manual fetch error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Batch processing queue
  async addToQueue(fetchJob) {
    this.fetchQueue.push({
      ...fetchJob,
      addedAt: Date.now()
    });

    console.log(`Added job to queue. Queue size: ${this.fetchQueue.length}`);
  }

  async startBatchProcessor() {
    if (this.processing) return;
    
    this.processing = true;
    
    const processBatch = async () => {
      if (this.fetchQueue.length === 0) {
        setTimeout(processBatch, this.batchInterval);
        return;
      }

      const batch = this.fetchQueue.splice(0, this.batchSize);
      
      console.log(`Processing batch of ${batch.length} jobs`);
      
      const promises = batch.map(async (job) => {
        try {
          return await this.executeFetchJob(job);
        } catch (error) {
          console.error('Batch job error:', error);
          return { success: false, error: error.message };
        }
      });

      await Promise.allSettled(promises);
      
      // Continue processing
      setTimeout(processBatch, this.batchInterval);
    };

    processBatch();
  }

  // Setup periodic maintenance tasks
  setupPeriodicTasks() {
    // Clean up old data daily
    cron.schedule('0 2 * * *', async () => {
      await this.cleanupOldData();
    });

    // Update KPIs hourly
    cron.schedule('0 * * * *', async () => {
      await this.updateKPIs();
    });

    // Cache warming every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      await this.warmCaches();
    });
  }

  // Cleanup old data
  async cleanupOldData() {
    const client = await this.pool.connect();
    try {
      console.log('Starting data cleanup...');
      
      // Clean old raw responses (keep 30 days)
      const rawCleanup = await client.query(`
        DELETE FROM api.raw_responses
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);

      // Clean old request logs (keep 7 days)
      const requestCleanup = await client.query(`
        DELETE FROM api.request_logs
        WHERE created_at < NOW() - INTERVAL '7 days'
      `);

      // Clean resolved errors (keep 90 days)
      const errorCleanup = await client.query(`
        DELETE FROM api.error_logs
        WHERE resolved = true AND resolved_at < NOW() - INTERVAL '90 days'
      `);

      console.log(`Cleanup completed: ${rawCleanup.rowCount} raw responses, ${requestCleanup.rowCount} request logs, ${errorCleanup.rowCount} resolved errors`);

    } catch (error) {
      console.error('Data cleanup error:', error);
    } finally {
      client.release();
    }
  }

  // Update KPIs for all data types
  async updateKPIs() {
    const client = await this.pool.connect();
    try {
      console.log('Updating KPIs...');
      
      // Get distinct data types and users
      const result = await client.query(`
        SELECT DISTINCT data_type, user_id
        FROM api.processed_data
        WHERE created_at >= CURRENT_DATE
      `);

      for (const row of result.rows) {
        try {
          await client.query(
            'SELECT api.create_kpi_snapshot($1, $2, $3)',
            [row.data_type, row.user_id, new Date().toISOString().split('T')[0]]
          );
        } catch (kpiError) {
          console.error(`Error updating KPI for ${row.data_type}/${row.user_id}:`, kpiError);
        }
      }

      console.log(`Updated KPIs for ${result.rows.length} data type/user combinations`);

    } catch (error) {
      console.error('KPI update error:', error);
    } finally {
      client.release();
    }
  }

  // Warm frequently accessed caches
  async warmCaches() {
    console.log('Warming caches...');
    
    try {
      // Warm processed data cache
      await cacheManager.warmCache('users', { limit: 100 });
      await cacheManager.warmCache('posts', { limit: 100 });
      await cacheManager.warmCache('transactions', { limit: 100 });
      
      console.log('Cache warming completed');
    } catch (error) {
      console.error('Cache warming error:', error);
    }
  }

  // Get current status and metrics
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.size,
      queueSize: this.fetchQueue.length,
      metrics: this.metrics,
      uptime: process.uptime()
    };
  }

  // Get fetch history for an endpoint
  async getFetchHistory(endpointId, days = 7) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          execution_date,
          users_processed,
          successful_fetches,
          failed_fetches,
          total_records,
          average_run_time_ms
        FROM api.fetch_metrics
        WHERE endpoint_id = $1 
        AND execution_date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY execution_date DESC
      `, [endpointId]);

      return {
        success: true,
        history: result.rows
      };
    } catch (error) {
      console.error('Error getting fetch history:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Stop all automated jobs
  async stop() {
    console.log('Stopping Automated Data Fetcher...');
    
    for (const [jobId, job] of this.jobs) {
      job.destroy();
      console.log(`Stopped job: ${jobId}`);
    }
    
    this.jobs.clear();
    this.isRunning = false;
    this.processing = false;
    
    console.log('Automated Data Fetcher stopped');
  }

  // Cleanup method
  async close() {
    await this.stop();
    await this.pool.end();
  }
}

module.exports = new AutomatedDataFetcher();
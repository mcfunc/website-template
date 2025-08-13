const promClient = require('prom-client');
const analyticsService = require('./analyticsService');

class MetricsExporter {
  constructor() {
    // Create a Registry
    this.register = new promClient.Registry();
    
    // Add default metrics
    promClient.collectDefaultMetrics({
      register: this.register,
      prefix: 'site_template_'
    });

    // Custom metrics
    this.httpRequestsTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register]
    });

    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register]
    });

    this.activeUsers = new promClient.Gauge({
      name: 'active_users_total',
      help: 'Number of currently active users',
      registers: [this.register]
    });

    this.sessionCount = new promClient.Gauge({
      name: 'sessions_total',
      help: 'Total number of active sessions',
      registers: [this.register]
    });

    this.pageViews = new promClient.Counter({
      name: 'page_views_total',
      help: 'Total number of page views',
      labelNames: ['path'],
      registers: [this.register]
    });

    this.errorCount = new promClient.Counter({
      name: 'errors_total',
      help: 'Total number of application errors',
      labelNames: ['type', 'severity'],
      registers: [this.register]
    });

    this.abTestAssignments = new promClient.Counter({
      name: 'ab_test_assignments_total',
      help: 'Total number of A/B test assignments',
      labelNames: ['test_name', 'variant_name'],
      registers: [this.register]
    });

    this.abTestConversions = new promClient.Counter({
      name: 'ab_test_conversions_total',
      help: 'Total number of A/B test conversions',
      labelNames: ['test_name', 'variant_name', 'metric_name'],
      registers: [this.register]
    });

    this.pluginsLoaded = new promClient.Gauge({
      name: 'plugins_loaded_total',
      help: 'Number of loaded plugins',
      registers: [this.register]
    });

    this.featureFlags = new promClient.Gauge({
      name: 'feature_flags_active_total',
      help: 'Number of active feature flags',
      registers: [this.register]
    });

    // Database connection pool metrics
    this.dbConnectionsActive = new promClient.Gauge({
      name: 'database_connections_active',
      help: 'Number of active database connections',
      registers: [this.register]
    });

    this.dbConnectionsIdle = new promClient.Gauge({
      name: 'database_connections_idle',
      help: 'Number of idle database connections',
      registers: [this.register]
    });

    this.dbQueryDuration = new promClient.Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register]
    });

    // Redis metrics
    this.redisConnectionsActive = new promClient.Gauge({
      name: 'redis_connections_active',
      help: 'Number of active Redis connections',
      registers: [this.register]
    });

    this.redisCacheHits = new promClient.Counter({
      name: 'redis_cache_hits_total',
      help: 'Total number of Redis cache hits',
      labelNames: ['key_pattern'],
      registers: [this.register]
    });

    this.redisCacheMisses = new promClient.Counter({
      name: 'redis_cache_misses_total',
      help: 'Total number of Redis cache misses',
      labelNames: ['key_pattern'],
      registers: [this.register]
    });

    // Start collecting real-time metrics
    this.startMetricsCollection();
  }

  // Middleware to track HTTP requests
  trackHTTPRequest() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route ? req.route.path : req.path;
        
        this.httpRequestsTotal.inc({
          method: req.method,
          route: route,
          status_code: res.statusCode
        });
        
        this.httpRequestDuration.observe({
          method: req.method,
          route: route,
          status_code: res.statusCode
        }, duration);
      });
      
      next();
    };
  }

  // Track page views
  trackPageView(path) {
    this.pageViews.inc({ path });
  }

  // Track errors
  trackError(type, severity = 'error') {
    this.errorCount.inc({ type, severity });
  }

  // Track A/B test assignments
  trackABTestAssignment(testName, variantName) {
    this.abTestAssignments.inc({
      test_name: testName,
      variant_name: variantName
    });
  }

  // Track A/B test conversions
  trackABTestConversion(testName, variantName, metricName) {
    this.abTestConversions.inc({
      test_name: testName,
      variant_name: variantName,
      metric_name: metricName
    });
  }

  // Track database metrics
  trackDBQuery(operation, table, duration) {
    this.dbQueryDuration.observe({ operation, table }, duration);
  }

  updateDBConnectionMetrics(active, idle) {
    this.dbConnectionsActive.set(active);
    this.dbConnectionsIdle.set(idle);
  }

  // Track Redis metrics
  updateRedisConnectionMetrics(active) {
    this.redisConnectionsActive.set(active);
  }

  trackCacheHit(keyPattern) {
    this.redisCacheHits.inc({ key_pattern: keyPattern });
  }

  trackCacheMiss(keyPattern) {
    this.redisCacheMisses.inc({ key_pattern: keyPattern });
  }

  // Update plugin metrics
  updatePluginMetrics(loadedCount) {
    this.pluginsLoaded.set(loadedCount);
  }

  // Update feature flag metrics
  updateFeatureFlagMetrics(activeCount) {
    this.featureFlags.set(activeCount);
  }

  // Start collecting real-time metrics
  startMetricsCollection() {
    // Update analytics metrics every 30 seconds
    setInterval(async () => {
      try {
        const realtimeMetrics = await analyticsService.getRealTimeMetrics();
        if (realtimeMetrics.success) {
          this.activeUsers.set(realtimeMetrics.data.activeUsers || 0);
          this.sessionCount.set(realtimeMetrics.data.sessions || 0);
        }
      } catch (error) {
        console.error('Failed to update real-time metrics:', error);
      }
    }, 30000);

    // Update system metrics every minute
    setInterval(async () => {
      try {
        // Record system metrics in database
        await analyticsService.recordSystemMetric(
          'memory_usage_percent',
          'memory',
          this.getMemoryUsage(),
          { serviceName: 'webapp' }
        );

        await analyticsService.recordSystemMetric(
          'cpu_usage_percent',
          'cpu',
          this.getCPUUsage(),
          { serviceName: 'webapp' }
        );
      } catch (error) {
        console.error('Failed to record system metrics:', error);
      }
    }, 60000);
  }

  // Get memory usage percentage
  getMemoryUsage() {
    const used = process.memoryUsage();
    return Math.round((used.heapUsed / used.heapTotal) * 100);
  }

  // Get CPU usage (simplified)
  getCPUUsage() {
    // This is a simplified CPU usage calculation
    // In production, you'd want to use a more sophisticated method
    const usage = process.cpuUsage();
    return Math.round((usage.user + usage.system) / 10000) % 100;
  }

  // Get metrics for Prometheus
  async getMetrics() {
    return this.register.metrics();
  }

  // Reset all metrics (useful for testing)
  resetMetrics() {
    this.register.resetMetrics();
  }

  // Get registry for advanced usage
  getRegister() {
    return this.register;
  }

  // Health check
  async healthCheck() {
    try {
      const metrics = await this.getMetrics();
      return {
        status: 'healthy',
        metrics_count: metrics.split('\n').filter(line => 
          line.startsWith('site_template_') || 
          line.startsWith('http_') || 
          line.startsWith('active_') ||
          line.startsWith('sessions_') ||
          line.startsWith('page_views_') ||
          line.startsWith('errors_')
        ).length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = new MetricsExporter();
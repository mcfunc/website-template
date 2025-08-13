const { Pool } = require('pg');
const cacheManager = require('./cacheManager');
const auditLogger = require('./auditLogger');

class ErrorMonitor {
  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || 'sitetemplate',
      user: process.env.POSTGRES_USER || 'admin',
      password: process.env.POSTGRES_PASSWORD || 'password',
      ssl: false,
    });

    // Error thresholds and alert rules
    this.alertRules = {
      error_rate_threshold: 10, // % of requests that can fail before alerting
      consecutive_failures: 5,   // Number of consecutive failures before alerting
      response_time_threshold: 5000, // Response time in ms before alerting
      critical_errors: ['oauth_refresh_failed', 'database_connection_lost', 'pipeline_error'],
      alert_cooldown: 300000, // 5 minutes between similar alerts
    };

    // Alert history to prevent spam
    this.alertHistory = new Map();
    
    // Error patterns to detect
    this.errorPatterns = {
      rate_limit_exceeded: /rate limit|too many requests/i,
      authentication_failed: /unauthorized|invalid.*token|authentication.*failed/i,
      network_timeout: /timeout|connection.*reset|network.*error/i,
      server_error: /internal.*server.*error|500|502|503|504/i,
      data_validation: /validation.*failed|invalid.*data|schema.*error/i
    };

    // Performance metrics tracking
    this.performanceMetrics = {
      responseTime: new Map(),
      errorCounts: new Map(),
      successCounts: new Map()
    };

    this.setupPeriodicChecks();
  }

  // Log error with classification and analysis
  async logError(error, context = {}) {
    try {
      const errorData = {
        type: this.classifyError(error),
        message: error.message || error,
        stack: error.stack,
        severity: this.determineSeverity(error, context),
        context,
        timestamp: new Date().toISOString(),
        patterns: this.analyzeErrorPatterns(error.message || error)
      };

      // Store in database
      const errorId = await this.storeError(errorData);
      
      // Check if alert should be triggered
      await this.checkAlertConditions(errorData);
      
      // Update error metrics
      await this.updateErrorMetrics(errorData);
      
      return {
        success: true,
        errorId,
        severity: errorData.severity,
        patterns: errorData.patterns
      };

    } catch (monitorError) {
      console.error('Error monitor logging failed:', monitorError);
      return {
        success: false,
        error: monitorError.message
      };
    }
  }

  // Classify error type
  classifyError(error) {
    const message = (error.message || error || '').toLowerCase();
    
    if (message.includes('timeout') || message.includes('network')) {
      return 'network_error';
    } else if (message.includes('unauthorized') || message.includes('authentication')) {
      return 'auth_error';
    } else if (message.includes('rate limit') || message.includes('too many')) {
      return 'rate_limit_error';
    } else if (message.includes('validation') || message.includes('invalid')) {
      return 'validation_error';
    } else if (message.includes('database') || message.includes('connection')) {
      return 'database_error';
    } else if (message.includes('api') || message.includes('external')) {
      return 'external_api_error';
    } else {
      return 'application_error';
    }
  }

  // Determine error severity
  determineSeverity(error, context) {
    const message = (error.message || error || '').toLowerCase();
    const errorType = this.classifyError(error);
    
    // Critical errors
    if (this.alertRules.critical_errors.some(pattern => message.includes(pattern))) {
      return 'critical';
    }
    
    // High severity conditions
    if (errorType === 'database_error' || 
        message.includes('pipeline') ||
        context.statusCode >= 500) {
      return 'high';
    }
    
    // Medium severity conditions
    if (errorType === 'auth_error' || 
        errorType === 'rate_limit_error' ||
        context.statusCode >= 400) {
      return 'medium';
    }
    
    // Default to low
    return 'low';
  }

  // Analyze error patterns
  analyzeErrorPatterns(message) {
    const patterns = [];
    
    for (const [patternName, regex] of Object.entries(this.errorPatterns)) {
      if (regex.test(message)) {
        patterns.push(patternName);
      }
    }
    
    return patterns;
  }

  // Store error in database
  async storeError(errorData) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        INSERT INTO api.error_logs (
          error_type, error_message, error_details, stack_trace, severity
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        errorData.type,
        errorData.message,
        JSON.stringify(errorData),
        errorData.stack,
        errorData.severity
      ]);
      
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  // Check if alert conditions are met
  async checkAlertConditions(errorData) {
    try {
      // Check critical errors (immediate alert)
      if (errorData.severity === 'critical') {
        await this.triggerAlert({
          type: 'critical_error',
          title: 'Critical Error Detected',
          message: errorData.message,
          severity: 'critical',
          context: errorData.context
        });
        return;
      }

      // Check error rate threshold
      const errorRate = await this.calculateErrorRate('1 hour');
      if (errorRate > this.alertRules.error_rate_threshold) {
        await this.triggerAlert({
          type: 'high_error_rate',
          title: `High Error Rate: ${errorRate.toFixed(1)}%`,
          message: `Error rate exceeded threshold of ${this.alertRules.error_rate_threshold}%`,
          severity: 'high',
          metrics: { error_rate: errorRate }
        });
      }

      // Check consecutive failures
      const consecutiveFailures = await this.getConsecutiveFailures(errorData.type);
      if (consecutiveFailures >= this.alertRules.consecutive_failures) {
        await this.triggerAlert({
          type: 'consecutive_failures',
          title: `${consecutiveFailures} Consecutive ${errorData.type} Failures`,
          message: `Multiple consecutive failures detected for ${errorData.type}`,
          severity: 'high',
          metrics: { consecutive_failures: consecutiveFailures }
        });
      }

    } catch (alertError) {
      console.error('Alert condition check failed:', alertError);
    }
  }

  // Calculate error rate for a time period
  async calculateErrorRate(period = '1 hour') {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
          COUNT(*) as total_count
        FROM api.request_logs
        WHERE created_at >= NOW() - INTERVAL '${period}'
      `);

      const { error_count, total_count } = result.rows[0] || {};
      
      if (!total_count || total_count === 0) return 0;
      
      return (error_count / total_count) * 100;
    } finally {
      client.release();
    }
  }

  // Get consecutive failures for error type
  async getConsecutiveFailures(errorType) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT COUNT(*) as consecutive_count
        FROM (
          SELECT error_type, created_at,
            ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
          FROM api.error_logs
          WHERE created_at >= NOW() - INTERVAL '1 hour'
          ORDER BY created_at DESC
        ) recent_errors
        WHERE error_type = $1 AND rn <= $2
      `, [errorType, this.alertRules.consecutive_failures]);

      return parseInt(result.rows[0]?.consecutive_count || 0);
    } finally {
      client.release();
    }
  }

  // Trigger alert
  async triggerAlert(alert) {
    const alertKey = `${alert.type}:${alert.severity}`;
    const now = Date.now();
    
    // Check cooldown period
    const lastAlert = this.alertHistory.get(alertKey);
    if (lastAlert && (now - lastAlert) < this.alertRules.alert_cooldown) {
      return; // Skip alert due to cooldown
    }

    try {
      // Store alert in database
      const client = await this.pool.connect();
      try {
        await client.query(`
          INSERT INTO api.alerts (
            alert_type, title, message, severity, alert_data, triggered_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
          alert.type,
          alert.title,
          alert.message,
          alert.severity,
          JSON.stringify(alert)
        ]);
      } finally {
        client.release();
      }

      // Cache alert to prevent spam
      this.alertHistory.set(alertKey, now);
      
      // Log alert trigger
      await auditLogger.log({
        event_type: 'system',
        action: 'alert_triggered',
        details: alert
      });

      // In production, this would integrate with notification services
      console.warn('🚨 ALERT TRIGGERED:', alert);
      
      // TODO: Integrate with notification services (email, Slack, PagerDuty, etc.)
      await this.sendNotification(alert);

    } catch (alertError) {
      console.error('Failed to trigger alert:', alertError);
    }
  }

  // Send notification (placeholder for integration)
  async sendNotification(alert) {
    // This would integrate with actual notification services
    const notification = {
      timestamp: new Date().toISOString(),
      level: alert.severity,
      title: alert.title,
      message: alert.message,
      service: 'Site Template API',
      environment: process.env.NODE_ENV || 'development'
    };

    // Log notification attempt
    console.log('📧 Notification sent:', notification);
    
    // TODO: Implement actual notification providers:
    // - Email (SendGrid, SES)
    // - Slack webhooks
    // - PagerDuty incidents
    // - Discord webhooks
    // - Teams notifications
  }

  // Monitor performance metrics
  async recordPerformanceMetric(operation, responseTime, success = true) {
    const key = `${operation}:${success ? 'success' : 'error'}`;
    const minute = Math.floor(Date.now() / 60000); // Group by minute
    
    // Update in-memory metrics
    if (!this.performanceMetrics.responseTime.has(key)) {
      this.performanceMetrics.responseTime.set(key, []);
    }
    
    this.performanceMetrics.responseTime.get(key).push({
      time: responseTime,
      timestamp: minute
    });

    // Keep only last 60 minutes of data
    const cutoff = minute - 60;
    const metrics = this.performanceMetrics.responseTime.get(key);
    this.performanceMetrics.responseTime.set(key, 
      metrics.filter(m => m.timestamp > cutoff)
    );

    // Check for performance alerts
    if (responseTime > this.alertRules.response_time_threshold) {
      await this.triggerAlert({
        type: 'slow_response',
        title: `Slow Response: ${operation}`,
        message: `Response time ${responseTime}ms exceeded threshold of ${this.alertRules.response_time_threshold}ms`,
        severity: 'medium',
        metrics: { response_time: responseTime, operation }
      });
    }
  }

  // Get error statistics
  async getErrorStats(period = '24 hours') {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          error_type,
          severity,
          COUNT(*) as count,
          MAX(created_at) as last_occurrence
        FROM api.error_logs
        WHERE created_at >= NOW() - INTERVAL '${period}'
        GROUP BY error_type, severity
        ORDER BY count DESC
      `);

      return {
        success: true,
        stats: result.rows,
        period
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Get recent alerts
  async getRecentAlerts(limit = 50) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          alert_type, title, message, severity, 
          alert_data, triggered_at, acknowledged, resolved
        FROM api.alerts
        ORDER BY triggered_at DESC
        LIMIT $1
      `, [limit]);

      return {
        success: true,
        alerts: result.rows
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Resolve alert
  async resolveAlert(alertId, resolvedBy, notes = '') {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE api.alerts
        SET resolved = true, resolved_at = NOW(), resolved_by = $2, resolution_notes = $3
        WHERE id = $1
      `, [alertId, resolvedBy, notes]);

      await auditLogger.log({
        event_type: 'system',
        action: 'alert_resolved',
        user_id: resolvedBy,
        details: { alert_id: alertId, notes }
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Setup periodic health checks
  setupPeriodicChecks() {
    // Check system health every 5 minutes
    setInterval(async () => {
      await this.performHealthCheck();
    }, 5 * 60 * 1000);

    // Clean up old metrics every hour
    setInterval(() => {
      this.cleanupMetrics();
    }, 60 * 60 * 1000);
  }

  // Perform comprehensive health check
  async performHealthCheck() {
    try {
      const checks = {
        database: await this.checkDatabaseHealth(),
        cache: await this.checkCacheHealth(),
        apis: await this.checkAPIHealth(),
        errorRate: await this.calculateErrorRate('5 minutes')
      };

      // Check for concerning trends
      if (checks.errorRate > this.alertRules.error_rate_threshold) {
        await this.triggerAlert({
          type: 'health_check_failed',
          title: 'Health Check: High Error Rate',
          message: `System error rate is ${checks.errorRate.toFixed(1)}%`,
          severity: 'high',
          context: checks
        });
      }

      // Log health check results
      await auditLogger.log({
        event_type: 'system',
        action: 'health_check_completed',
        details: checks
      });

    } catch (error) {
      console.error('Health check failed:', error);
      await this.triggerAlert({
        type: 'health_check_error',
        title: 'Health Check Failed',
        message: error.message,
        severity: 'high',
        context: { error: error.stack }
      });
    }
  }

  // Check database health
  async checkDatabaseHealth() {
    try {
      const client = await this.pool.connect();
      const start = Date.now();
      await client.query('SELECT 1');
      client.release();
      
      return {
        status: 'healthy',
        responseTime: Date.now() - start
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Check cache health
  async checkCacheHealth() {
    try {
      return await cacheManager.healthCheck();
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Check API health
  async checkAPIHealth() {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 END) as healthy_requests,
          COUNT(*) as total_requests,
          AVG(response_time_ms) as avg_response_time
        FROM api.request_logs
        WHERE created_at >= NOW() - INTERVAL '5 minutes'
      `);

      const { healthy_requests, total_requests, avg_response_time } = result.rows[0] || {};
      
      return {
        status: total_requests > 0 && (healthy_requests / total_requests) > 0.95 ? 'healthy' : 'degraded',
        healthyRequests: parseInt(healthy_requests || 0),
        totalRequests: parseInt(total_requests || 0),
        avgResponseTime: parseFloat(avg_response_time || 0)
      };
    } finally {
      client.release();
    }
  }

  // Clean up old metrics from memory
  cleanupMetrics() {
    const cutoff = Math.floor(Date.now() / 60000) - 60; // Keep 1 hour
    
    for (const [key, metrics] of this.performanceMetrics.responseTime) {
      this.performanceMetrics.responseTime.set(key,
        metrics.filter(m => m.timestamp > cutoff)
      );
    }
  }

  // Get system status dashboard
  async getSystemStatus() {
    try {
      const [errorStats, recentAlerts, healthChecks] = await Promise.all([
        this.getErrorStats('1 hour'),
        this.getRecentAlerts(10),
        this.performHealthCheck()
      ]);

      return {
        success: true,
        status: {
          errorStats: errorStats.stats || [],
          recentAlerts: recentAlerts.alerts || [],
          healthChecks,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
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

module.exports = new ErrorMonitor();
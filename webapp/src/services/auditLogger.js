const { Pool } = require('pg');
const winston = require('winston');

class AuditLogger {
  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || 'sitetemplate',
      user: process.env.POSTGRES_USER || 'admin',
      password: process.env.POSTGRES_PASSWORD || 'password',
      ssl: false,
      max: 5, // Dedicated pool for audit logging
    });

    // Setup Winston logger for file-based audit trail
    this.fileLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'audit' },
      transports: [
        // Only use file logging in development or when logs directory is writable
        ...(process.env.NODE_ENV === 'development' && process.env.ENABLE_FILE_LOGGING ? [
          new winston.transports.File({ 
            filename: '/tmp/audit-error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 10,
            tailable: true
          }),
          new winston.transports.File({ 
            filename: '/tmp/audit.log',
            maxsize: 5242880, // 5MB
            maxFiles: 50,
            tailable: true
          })
        ] : [])
      ],
    });

    // Add console logging in development
    if (process.env.NODE_ENV !== 'production') {
      this.fileLogger.add(new winston.transports.Console({
        format: winston.format.simple()
      }));
    }
  }

  async log(auditData) {
    const timestamp = new Date().toISOString();
    
    // Prepare audit entry
    const entry = {
      timestamp,
      event_type: auditData.event_type,
      user_id: auditData.user_id || null,
      resource_type: auditData.resource_type || null,
      resource_id: auditData.resource_id || null,
      action: auditData.action,
      details: auditData.details || {},
      ip_address: auditData.ip_address || null,
      user_agent: auditData.user_agent || null,
      session_id: auditData.session_id || null,
      correlation_id: auditData.correlation_id || null
    };

    // Log to both database and file
    await Promise.all([
      this.logToDatabase(entry),
      this.logToFile(entry)
    ]);

    return entry;
  }

  async logToDatabase(entry) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT audit.create_audit_entry($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      
      await client.query(query, [
        entry.event_type,
        entry.user_id,
        entry.resource_type,
        entry.resource_id,
        entry.action,
        JSON.stringify(entry.details),
        entry.ip_address,
        entry.user_agent
      ]);
    } catch (error) {
      console.error('Database audit logging failed:', error);
      // Don't throw - we don't want audit logging to break the main flow
      // Log the error to file instead
      this.fileLogger.error('Database audit logging failed', {
        error: error.message,
        entry
      });
    } finally {
      client.release();
    }
  }

  async logToFile(entry) {
    try {
      this.fileLogger.info('Audit event', entry);
    } catch (error) {
      console.error('File audit logging failed:', error);
      // Last resort - log to console
      console.log('AUDIT:', JSON.stringify(entry));
    }
  }

  // Authentication audit helpers
  async logAuth(action, userId, details = {}) {
    return this.log({
      event_type: 'auth',
      action,
      user_id: userId,
      resource_type: 'user',
      resource_id: userId,
      details: {
        ...details,
        timestamp: new Date().toISOString()
      }
    });
  }

  async logLogin(userId, provider, ipAddress, userAgent) {
    return this.logAuth('login', userId, {
      provider,
      ip_address: ipAddress,
      user_agent: userAgent,
      success: true
    });
  }

  async logLoginFailed(email, reason, ipAddress, userAgent) {
    return this.log({
      event_type: 'auth',
      action: 'login_failed',
      details: {
        email,
        reason,
        ip_address: ipAddress,
        user_agent: userAgent,
        success: false
      }
    });
  }

  async logLogout(userId, ipAddress, userAgent) {
    return this.logAuth('logout', userId, {
      ip_address: ipAddress,
      user_agent: userAgent
    });
  }

  async logPasswordChange(userId, ipAddress) {
    return this.logAuth('password_changed', userId, {
      ip_address: ipAddress
    });
  }

  // User management audit helpers
  async logUserCreated(userId, createdByUserId, details = {}) {
    return this.log({
      event_type: 'user',
      action: 'created',
      user_id: createdByUserId,
      resource_type: 'user',
      resource_id: userId,
      details
    });
  }

  async logUserUpdated(userId, updatedByUserId, changes) {
    return this.log({
      event_type: 'user',
      action: 'updated',
      user_id: updatedByUserId,
      resource_type: 'user',
      resource_id: userId,
      details: { changes }
    });
  }

  async logUserDeleted(userId, deletedByUserId) {
    return this.log({
      event_type: 'user',
      action: 'deleted',
      user_id: deletedByUserId,
      resource_type: 'user',
      resource_id: userId,
      details: { deleted_user_id: userId }
    });
  }

  // Role and permission audit helpers
  async logRoleAssigned(userId, role, assignedByUserId) {
    return this.log({
      event_type: 'rbac',
      action: 'role_assigned',
      user_id: assignedByUserId,
      resource_type: 'user',
      resource_id: userId,
      details: { role, assigned_to: userId }
    });
  }

  async logRoleRevoked(userId, role, revokedByUserId) {
    return this.log({
      event_type: 'rbac',
      action: 'role_revoked',
      user_id: revokedByUserId,
      resource_type: 'user',
      resource_id: userId,
      details: { role, revoked_from: userId }
    });
  }

  async logPermissionGranted(userId, permission, grantedByUserId) {
    return this.log({
      event_type: 'rbac',
      action: 'permission_granted',
      user_id: grantedByUserId,
      resource_type: 'user',
      resource_id: userId,
      details: { permission, granted_to: userId }
    });
  }

  // Data access audit helpers
  async logDataAccess(userId, resourceType, resourceId, action, details = {}) {
    return this.log({
      event_type: 'data',
      action,
      user_id: userId,
      resource_type: resourceType,
      resource_id: resourceId,
      details
    });
  }

  async logApiCall(userId, endpoint, method, statusCode, responseTime) {
    return this.log({
      event_type: 'api',
      action: 'call',
      user_id: userId,
      resource_type: 'endpoint',
      resource_id: endpoint,
      details: {
        method,
        status_code: statusCode,
        response_time_ms: responseTime
      }
    });
  }

  // System audit helpers
  async logSystemEvent(action, details = {}) {
    return this.log({
      event_type: 'system',
      action,
      resource_type: 'system',
      details
    });
  }

  async logConfigChange(changedByUserId, setting, oldValue, newValue) {
    return this.log({
      event_type: 'config',
      action: 'changed',
      user_id: changedByUserId,
      resource_type: 'setting',
      resource_id: setting,
      details: {
        setting,
        old_value: oldValue,
        new_value: newValue
      }
    });
  }

  // Security audit helpers
  async logSecurityEvent(type, details = {}) {
    return this.log({
      event_type: 'security',
      action: type,
      details: {
        ...details,
        severity: details.severity || 'medium'
      }
    });
  }

  async logSuspiciousActivity(userId, activity, details = {}) {
    return this.logSecurityEvent('suspicious_activity', {
      user_id: userId,
      activity,
      ...details,
      severity: 'high'
    });
  }

  // Query helpers for retrieving audit logs
  async getAuditLogs(options = {}) {
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT id, event_type, user_id, resource_type, resource_id, 
               action, details, ip_address, user_agent, created_at
        FROM audit.audit_log
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;

      if (options.event_type) {
        query += ` AND event_type = $${paramIndex++}`;
        params.push(options.event_type);
      }

      if (options.user_id) {
        query += ` AND user_id = $${paramIndex++}`;
        params.push(options.user_id);
      }

      if (options.resource_type) {
        query += ` AND resource_type = $${paramIndex++}`;
        params.push(options.resource_type);
      }

      if (options.action) {
        query += ` AND action = $${paramIndex++}`;
        params.push(options.action);
      }

      if (options.from_date) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(options.from_date);
      }

      if (options.to_date) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(options.to_date);
      }

      query += ` ORDER BY created_at DESC`;

      if (options.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(options.limit);
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(options.offset);
      }

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Get audit logs error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getAuditStats(timeRange = '24 hours') {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_events,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT event_type) as event_types,
          json_object_agg(event_type, event_count) as events_by_type
        FROM (
          SELECT 
            event_type,
            user_id,
            COUNT(*) as event_count
          FROM audit.audit_log 
          WHERE created_at > NOW() - INTERVAL '${timeRange}'
          GROUP BY event_type, user_id
        ) stats
      `;
      
      const result = await client.query(query);
      return result.rows[0];
    } catch (error) {
      console.error('Get audit stats error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Health check
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT COUNT(*) FROM audit.audit_log WHERE created_at > NOW() - INTERVAL \'1 hour\'');
      client.release();
      
      return {
        status: 'healthy',
        recent_events: parseInt(result.rows[0].count),
        pool_status: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        }
      };
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

module.exports = new AuditLogger();
const express = require('express');
const { authenticateToken, requirePermissions } = require('../middleware/auth');
const analyticsService = require('../services/analyticsService');
const abTestingService = require('../services/abTestingService');
const auditLogger = require('../services/auditLogger');

const router = express.Router();

// Middleware for admin routes
const requireAdmin = requirePermissions(['admin:dashboard', 'admin:users', 'admin:system']);

// Analytics Endpoints
router.get('/analytics/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    const result = await analyticsService.getDashboardMetrics(timeframe);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    await auditLogger.log({
      user_id: req.user.id,
      event_type: 'admin_dashboard_view',
      resource_type: 'analytics',
      details: { timeframe },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json(result.data);
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    res.status(500).json({ error: 'Failed to load dashboard metrics' });
  }
});

router.get('/analytics/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { start_date, end_date } = req.query;
    
    const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end_date ? new Date(end_date) : new Date();

    const result = await analyticsService.getUserMetrics(userId, startDate, endDate);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    await auditLogger.log({
      user_id: req.user.id,
      event_type: 'user_metrics_view',
      resource_type: 'analytics',
      resource_id: userId,
      details: { start_date: startDate, end_date: endDate },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json(result.data);
  } catch (error) {
    console.error('User metrics error:', error);
    res.status(500).json({ error: 'Failed to load user metrics' });
  }
});

router.get('/system/metrics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { start_date, end_date, service } = req.query;
    
    const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = end_date ? new Date(end_date) : new Date();

    const result = await analyticsService.getSystemMetrics(startDate, endDate, service);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Group metrics by service for easier frontend consumption
    const groupedMetrics = {};
    result.data.forEach(metric => {
      const serviceName = metric.service_name || 'system';
      if (!groupedMetrics[serviceName]) {
        groupedMetrics[serviceName] = {
          status: 'healthy',
          data: {}
        };
      }
      
      groupedMetrics[serviceName].data[metric.metric_name] = {
        avg: parseFloat(metric.avg_value).toFixed(2),
        min: parseFloat(metric.min_value).toFixed(2),
        max: parseFloat(metric.max_value).toFixed(2),
        unit: metric.unit,
        data_points: parseInt(metric.data_points)
      };
    });

    res.json(groupedMetrics);
  } catch (error) {
    console.error('System metrics error:', error);
    res.status(500).json({ error: 'Failed to load system metrics' });
  }
});

router.post('/system/metrics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { metric_name, metric_type, value, service_name, unit, tags } = req.body;

    if (!metric_name || !metric_type || value === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: metric_name, metric_type, value' 
      });
    }

    const result = await analyticsService.recordSystemMetric(
      metric_name,
      metric_type,
      value,
      {
        serviceName: service_name,
        instanceId: req.headers['x-instance-id'],
        unit,
        tags
      }
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({ 
      success: true, 
      metric_id: result.metricId 
    });
  } catch (error) {
    console.error('Record metric error:', error);
    res.status(500).json({ error: 'Failed to record metric' });
  }
});

// A/B Testing Endpoints
router.get('/ab-tests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await abTestingService.getActiveTests();
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    await auditLogger.log({
      user_id: req.user.id,
      event_type: 'ab_tests_view',
      resource_type: 'ab_testing',
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json(result.data);
  } catch (error) {
    console.error('A/B tests error:', error);
    res.status(500).json({ error: 'Failed to load A/B tests' });
  }
});

router.get('/ab-tests/active', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await abTestingService.getActiveTests();
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Active A/B tests error:', error);
    res.status(500).json({ error: 'Failed to load active A/B tests' });
  }
});

router.get('/ab-tests/:testName', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { testName } = req.params;
    
    const result = await abTestingService.getTestByName(testName);
    
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Get A/B test error:', error);
    res.status(500).json({ error: 'Failed to load A/B test' });
  }
});

router.get('/ab-tests/:testName/results', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { testName } = req.params;
    const { start_date, end_date } = req.query;
    
    const startDate = start_date ? new Date(start_date) : null;
    const endDate = end_date ? new Date(end_date) : null;

    const result = await abTestingService.getTestResults(testName, startDate, endDate);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    await auditLogger.log({
      user_id: req.user.id,
      event_type: 'ab_test_results_view',
      resource_type: 'ab_testing',
      resource_id: testName,
      details: { start_date: startDate, end_date: endDate },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json(result.data);
  } catch (error) {
    console.error('A/B test results error:', error);
    res.status(500).json({ error: 'Failed to load A/B test results' });
  }
});

router.get('/ab-tests/:testName/significance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { testName } = req.params;
    const { metric = 'conversion' } = req.query;

    const result = await abTestingService.calculateStatisticalSignificance(testName, metric);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Statistical significance error:', error);
    res.status(500).json({ error: 'Failed to calculate statistical significance' });
  }
});

router.post('/ab-tests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const testData = {
      ...req.body,
      created_by: req.user.id
    };

    // Basic validation
    if (!testData.name || !testData.display_name || !testData.success_metrics) {
      return res.status(400).json({
        error: 'Missing required fields: name, display_name, success_metrics'
      });
    }

    if (!testData.variants || testData.variants.length < 2) {
      return res.status(400).json({
        error: 'At least 2 variants are required'
      });
    }

    // Validate traffic weights sum to 100%
    const totalWeight = testData.variants.reduce((sum, v) => sum + (v.traffic_weight || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      return res.status(400).json({
        error: 'Variant traffic weights must sum to 100%'
      });
    }

    const result = await abTestingService.createTest(testData);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    await auditLogger.log({
      user_id: req.user.id,
      event_type: 'ab_test_create',
      resource_type: 'ab_testing',
      resource_id: result.testId,
      details: { name: testData.name, display_name: testData.display_name },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.status(201).json({ 
      success: true, 
      test_id: result.testId 
    });
  } catch (error) {
    console.error('Create A/B test error:', error);
    res.status(500).json({ error: 'Failed to create A/B test' });
  }
});

// User Management Endpoints
router.get('/users', authenticateToken, requirePermissions(['admin:users']), async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        u.id, u.email, u.name, u.roles, u.permissions,
        u.created_at, u.updated_at, u.last_login_at, u.active,
        COUNT(s.id) as session_count
      FROM auth.users u
      LEFT JOIN analytics.user_sessions s ON u.id = s.user_id 
        AND s.started_at >= NOW() - INTERVAL '30 days'
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status === 'active') {
      query += ` AND u.active = true`;
    } else if (status === 'inactive') {
      query += ` AND u.active = false`;
    }

    query += ` 
      GROUP BY u.id, u.email, u.name, u.roles, u.permissions,
               u.created_at, u.updated_at, u.last_login_at, u.active
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(parseInt(limit), offset);

    const { Pool } = require('pg');
    const poolConfig = process.env.DATABASE_URL 
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'sitetemplate',
          user: process.env.POSTGRES_USER || 'admin',
          password: process.env.POSTGRES_PASSWORD || 'password'
        };
    
    const pool = new Pool({
      ...poolConfig,
      ssl: false,
    });

    const client = await pool.connect();
    const result = await client.query(query, params);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM auth.users u
      WHERE 1=1
      ${search ? 'AND (u.email ILIKE $1 OR u.name ILIKE $1)' : ''}
      ${status === 'active' ? 'AND u.active = true' : ''}
      ${status === 'inactive' ? 'AND u.active = false' : ''}
    `;
    
    const countParams = search ? [`%${search}%`] : [];
    const countResult = await client.query(countQuery, countParams);
    
    client.release();

    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.post('/users/:userId/actions', authenticateToken, requirePermissions(['admin:users']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, reason } = req.body;

    if (!['activate', 'deactivate', 'reset_password', 'update_roles'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    // Record admin action
    const { Pool } = require('pg');
    const poolConfig = process.env.DATABASE_URL 
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'sitetemplate',
          user: process.env.POSTGRES_USER || 'admin',
          password: process.env.POSTGRES_PASSWORD || 'password'
        };
    
    const pool = new Pool({
      ...poolConfig,
      ssl: false,
    });

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Record the admin action
      await client.query(`
        INSERT INTO admin.user_actions (admin_user_id, target_user_id, action_type, reason, details)
        VALUES ($1, $2, $3, $4, $5)
      `, [req.user.id, userId, action, reason, JSON.stringify(req.body)]);

      // Perform the action
      switch (action) {
        case 'activate':
          await client.query('UPDATE auth.users SET active = true WHERE id = $1', [userId]);
          break;
        case 'deactivate':
          await client.query('UPDATE auth.users SET active = false WHERE id = $1', [userId]);
          break;
        case 'reset_password':
          // In a real implementation, this would trigger a password reset email
          break;
        case 'update_roles':
          const { roles, permissions } = req.body;
          await client.query(
            'UPDATE auth.users SET roles = $1, permissions = $2 WHERE id = $3',
            [JSON.stringify(roles), JSON.stringify(permissions), userId]
          );
          break;
      }

      await client.query('COMMIT');
      
      await auditLogger.log({
        user_id: req.user.id,
        event_type: 'admin_user_action',
        resource_type: 'user_management',
        resource_id: userId,
        details: { action, reason },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Admin user action error:', error);
    res.status(500).json({ error: 'Failed to perform user action' });
  }
});

// Real-time Analytics
router.get('/analytics/realtime', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await analyticsService.getRealTimeMetrics();
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Real-time analytics error:', error);
    res.status(500).json({ error: 'Failed to load real-time analytics' });
  }
});

// Health Check
router.get('/health', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const analyticsHealth = await analyticsService.healthCheck();
    const abTestingHealth = await abTestingService.healthCheck();

    res.json({
      status: 'ok',
      services: {
        analytics: analyticsHealth,
        ab_testing: abTestingHealth
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin health check error:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
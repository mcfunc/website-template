const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const apiClient = require('../services/apiClient');
const dataProcessor = require('../services/dataProcessor');
const dataFetcher = require('../services/dataFetcher');
const kpiCalculator = require('../services/kpiCalculator');
const errorMonitor = require('../services/errorMonitor');
const cacheManager = require('../services/cacheManager');
const auditLogger = require('../services/auditLogger');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// External API Data Fetching Routes

// Manual data fetch
router.post('/fetch/:provider/:endpoint', authenticateToken, async (req, res) => {
  try {
    const { provider, endpoint } = req.params;
    const { forceRefresh = false } = req.body;

    const result = await dataFetcher.manualFetch(
      provider, 
      endpoint, 
      req.user.userId,
      { forceRefresh }
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log manual fetch
    await auditLogger.logDataAccess(
      req.user.userId, 'manual_api_fetch', null, 'create',
      { provider, endpoint, cached: result.cached }
    );

    res.json({
      success: true,
      data: result.fetchResult.data,
      processed: result.recordCount,
      cached: result.cached,
      qualityScore: result.qualityScore
    });

  } catch (error) {
    console.error('Manual fetch error:', error);
    await errorMonitor.logError(error, {
      endpoint: req.path,
      user_id: req.user.userId,
      provider: req.params.provider,
      api_endpoint: req.params.endpoint
    });
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Get available providers and endpoints
router.get('/providers', authenticateToken, async (req, res) => {
  try {
    const providers = await apiClient.getProviders();
    res.json({ success: true, providers });
  } catch (error) {
    console.error('Get providers error:', error);
    res.status(500).json({ error: 'Failed to retrieve providers' });
  }
});

// Data Processing Routes

// Get processed data
router.get('/data/:dataType', authenticateToken, async (req, res) => {
  try {
    const { dataType } = req.params;
    const { 
      limit = 50, 
      offset = 0, 
      startDate, 
      endDate,
      includeMetadata = false 
    } = req.query;

    const result = await dataProcessor.getProcessedData({
      dataType,
      userId: req.user.userId,
      limit: parseInt(limit),
      offset: parseInt(offset),
      startDate,
      endDate,
      includeMetadata: includeMetadata === 'true'
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get processed data error:', error);
    res.status(500).json({ error: 'Failed to retrieve processed data' });
  }
});

// Get data quality metrics
router.get('/quality/:endpointId/:dataType', authenticateToken, async (req, res) => {
  try {
    const { endpointId, dataType } = req.params;
    const { days = 7 } = req.query;

    const result = await dataProcessor.getDataQualityMetrics(
      parseInt(endpointId),
      dataType,
      parseInt(days)
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get data quality error:', error);
    res.status(500).json({ error: 'Failed to retrieve data quality metrics' });
  }
});

// KPI and Analytics Routes

// Calculate KPIs
router.get('/kpi/:dataType', authenticateToken, async (req, res) => {
  try {
    const { dataType } = req.params;
    const { period = 'all', forceRefresh = false } = req.query;

    const result = await kpiCalculator.calculateKPIs(
      dataType, 
      req.user.userId, 
      period,
      { 
        useCache: forceRefresh !== 'true',
        forceRefresh: forceRefresh === 'true'
      }
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log KPI access
    await auditLogger.logDataAccess(
      req.user.userId, 'kpi_access', null, 'view',
      { data_type: dataType, period, cached: result.cached }
    );

    res.json(result);

  } catch (error) {
    console.error('KPI calculation error:', error);
    await errorMonitor.logError(error, {
      endpoint: req.path,
      user_id: req.user.userId,
      data_type: req.params.dataType
    });
    res.status(500).json({ error: 'Failed to calculate KPIs' });
  }
});

// Get KPI trends
router.get('/kpi/:dataType/:kpiName/trends', authenticateToken, async (req, res) => {
  try {
    const { dataType, kpiName } = req.params;
    const { days = 30 } = req.query;

    const result = await kpiCalculator.getKPITrends(
      dataType,
      req.user.userId,
      kpiName,
      parseInt(days)
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('KPI trends error:', error);
    res.status(500).json({ error: 'Failed to retrieve KPI trends' });
  }
});

// Compare KPIs
router.post('/kpi/:dataType/:kpiName/compare', authenticateToken, async (req, res) => {
  try {
    const { dataType, kpiName } = req.params;
    const { userIds = [], periods = ['last_7_days', 'last_30_days'], limit = 10 } = req.body;

    const result = await kpiCalculator.compareKPIs(dataType, kpiName, {
      userIds,
      periods,
      limit
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('KPI comparison error:', error);
    res.status(500).json({ error: 'Failed to compare KPIs' });
  }
});

// Automated Data Fetching Routes

// Get fetch status
router.get('/fetch/status', authenticateToken, async (req, res) => {
  try {
    const status = dataFetcher.getStatus();
    res.json({ success: true, status });
  } catch (error) {
    console.error('Get fetch status error:', error);
    res.status(500).json({ error: 'Failed to retrieve fetch status' });
  }
});

// Get fetch history
router.get('/fetch/history/:endpointId', authenticateToken, async (req, res) => {
  try {
    const { endpointId } = req.params;
    const { days = 7 } = req.query;

    const result = await dataFetcher.getFetchHistory(
      parseInt(endpointId),
      parseInt(days)
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get fetch history error:', error);
    res.status(500).json({ error: 'Failed to retrieve fetch history' });
  }
});

// Cache Management Routes

// Get cache statistics
router.get('/cache/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await cacheManager.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get cache stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve cache statistics' });
  }
});

// Clear cache
router.delete('/cache/:pattern', authenticateToken, async (req, res) => {
  try {
    const { pattern } = req.params;
    
    // Only allow admin users to clear cache
    if (!req.user.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await cacheManager.invalidatePattern(pattern);
    
    await auditLogger.log({
      event_type: 'admin',
      action: 'cache_cleared',
      user_id: req.user.userId,
      details: { pattern, keys_cleared: result }
    });

    res.json({ success: true, keysCleared: result });

  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Error Monitoring Routes

// Get error statistics
router.get('/errors/stats', authenticateToken, async (req, res) => {
  try {
    const { period = '24 hours' } = req.query;
    const result = await errorMonitor.getErrorStats(period);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get error stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve error statistics' });
  }
});

// Get recent alerts
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const result = await errorMonitor.getRecentAlerts(parseInt(limit));

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to retrieve alerts' });
  }
});

// Resolve alert
router.put('/alerts/:alertId/resolve', authenticateToken, async (req, res) => {
  try {
    const { alertId } = req.params;
    const { notes = '' } = req.body;

    const result = await errorMonitor.resolveAlert(
      parseInt(alertId),
      req.user.userId,
      notes
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Resolve alert error:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// System Health Routes

// Overall system status
router.get('/health', async (req, res) => {
  try {
    const [
      apiClientHealth,
      dataProcessorHealth,
      kpiCalculatorHealth,
      errorMonitorHealth,
      cacheHealth
    ] = await Promise.all([
      apiClient.healthCheck(),
      dataProcessor.healthCheck(),
      kpiCalculator.healthCheck(),
      errorMonitor.healthCheck(),
      cacheManager.healthCheck()
    ]);

    const overall = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        apiClient: apiClientHealth,
        dataProcessor: dataProcessorHealth,
        kpiCalculator: kpiCalculatorHealth,
        errorMonitor: errorMonitorHealth,
        cache: cacheHealth
      }
    };

    // Determine overall status
    const unhealthyServices = Object.values(overall.services)
      .filter(service => service.status !== 'healthy');
    
    if (unhealthyServices.length > 0) {
      overall.status = unhealthyServices.length > 2 ? 'unhealthy' : 'degraded';
    }

    res.json(overall);

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// System status dashboard
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = await errorMonitor.getSystemStatus();

    if (!status.success) {
      return res.status(500).json(status);
    }

    res.json(status);

  } catch (error) {
    console.error('System status error:', error);
    res.status(500).json({ error: 'Failed to retrieve system status' });
  }
});

module.exports = router;
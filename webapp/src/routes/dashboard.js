const express = require('express');
const { authenticateToken, requirePermissions } = require('../middleware/auth');
const dashboardService = require('../services/dashboardService');
const websocketService = require('../services/websocketService');

const router = express.Router();

// Middleware for dashboard routes
const requireDashboardAccess = requirePermissions(['read:dashboard', 'write:dashboard']);

// Widget Type Endpoints
router.get('/widget-types', authenticateToken, async (req, res) => {
  try {
    const { category } = req.query;
    const result = await dashboardService.getWidgetTypes(category);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Get widget types error:', error);
    res.status(500).json({ error: 'Failed to fetch widget types' });
  }
});

router.post('/widget-types', authenticateToken, requirePermissions(['admin:dashboard']), async (req, res) => {
  try {
    const result = await dashboardService.createWidgetType(req.body);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ 
      success: true, 
      widgetTypeId: result.widgetTypeId 
    });
  } catch (error) {
    console.error('Create widget type error:', error);
    res.status(500).json({ error: 'Failed to create widget type' });
  }
});

// Dashboard Management Endpoints
router.get('/dashboards', authenticateToken, requireDashboardAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await dashboardService.getUserDashboards(userId);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Get user dashboards error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboards' });
  }
});

router.get('/dashboards/:name/config', authenticateToken, requireDashboardAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.params;
    const dashboardName = name === 'default' ? null : name;
    
    const result = await dashboardService.getDashboardConfig(userId, dashboardName);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Get dashboard config error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard configuration' });
  }
});

router.post('/dashboards', authenticateToken, requireDashboardAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await dashboardService.createDashboard(userId, req.body);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ 
      success: true, 
      dashboardId: result.dashboardId 
    });
  } catch (error) {
    console.error('Create dashboard error:', error);
    res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

router.put('/dashboards/:id', authenticateToken, requireDashboardAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await dashboardService.updateDashboard(userId, id, req.body);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update dashboard error:', error);
    res.status(500).json({ error: 'Failed to update dashboard' });
  }
});

// Widget Instance Endpoints
router.post('/dashboards/:id/widgets', authenticateToken, requireDashboardAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: dashboardId } = req.params;
    const result = await dashboardService.addWidgetToDashboard(userId, dashboardId, req.body);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ 
      success: true, 
      widgetId: result.widgetId 
    });
  } catch (error) {
    console.error('Add widget error:', error);
    res.status(500).json({ error: 'Failed to add widget to dashboard' });
  }
});

router.put('/widgets/:id', authenticateToken, requireDashboardAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await dashboardService.updateDashboardWidget(userId, id, req.body);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update widget error:', error);
    res.status(500).json({ error: 'Failed to update widget' });
  }
});

router.delete('/widgets/:id', authenticateToken, requireDashboardAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await dashboardService.removeDashboardWidget(userId, id);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove widget error:', error);
    res.status(500).json({ error: 'Failed to remove widget' });
  }
});

// Widget Data Endpoints
router.get('/widgets/:id/data', authenticateToken, requireDashboardAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dashboardService.getWidgetData(id, req.query);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Get widget data error:', error);
    res.status(500).json({ error: 'Failed to fetch widget data' });
  }
});

// Real-time Data Streaming Endpoints
router.get('/realtime/streams', authenticateToken, async (req, res) => {
  try {
    const streams = await websocketService.getAvailableStreams();
    res.json({ streams });
  } catch (error) {
    console.error('Get streams error:', error);
    res.status(500).json({ error: 'Failed to fetch data streams' });
  }
});

router.post('/realtime/streams/:name/publish', authenticateToken, requirePermissions(['admin:realtime']), async (req, res) => {
  try {
    const { name } = req.params;
    const { data, options = {} } = req.body;
    
    const result = await websocketService.publishToStream(name, data, options);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Publish to stream error:', error);
    res.status(500).json({ error: 'Failed to publish to stream' });
  }
});

// Alert Management Endpoints
router.post('/alerts', authenticateToken, requirePermissions(['admin:alerts']), async (req, res) => {
  try {
    const alertData = {
      ...req.body,
      triggeredBy: req.user.id
    };
    
    const result = await websocketService.createAlert(alertData);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ 
      success: true, 
      alertId: result.alertId 
    });
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// WebSocket Connection Stats (Admin only)
router.get('/websocket/stats', authenticateToken, requirePermissions(['admin:system']), async (req, res) => {
  try {
    const stats = websocketService.getConnectionStats();
    res.json(stats);
  } catch (error) {
    console.error('Get WebSocket stats error:', error);
    res.status(500).json({ error: 'Failed to fetch WebSocket statistics' });
  }
});

// Health check for dashboard services
router.get('/health', async (req, res) => {
  try {
    const dashboardHealth = await dashboardService.healthCheck();
    const websocketHealth = await websocketService.healthCheck();
    
    const overallStatus = dashboardHealth.status === 'healthy' && websocketHealth.status === 'healthy' 
      ? 'healthy' : 'degraded';
    
    res.json({
      status: overallStatus,
      services: {
        dashboard: dashboardHealth,
        websocket: websocketHealth
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Dashboard health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    });
  }
});

module.exports = router;
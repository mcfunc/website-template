const express = require('express');
const { createServer } = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Import routes and services
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const apiRoutes = require('./routes/api');
const themingRoutes = require('./routes/theming');
const pluginsRoutes = require('./routes/plugins');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const auditLogger = require('./services/auditLogger');

// Import Stage 3 services
const apiClient = require('./services/apiClient');
const dataFetcher = require('./services/dataFetcher');
const errorMonitor = require('./services/errorMonitor');

// Import Stage 4 services
const themingService = require('./services/themingService');
const pluginService = require('./services/pluginService');
const navigationService = require('./services/navigationService');

// Import Stage 5 services
const analyticsService = require('./services/analyticsService');
const abTestingService = require('./services/abTestingService');
const metricsExporter = require('./services/metricsExporter');

// Import Stage 6 services
const websocketService = require('./services/websocketService');
const dashboardService = require('./services/dashboardService');

// Don't create logs directory in production Docker container
// Logging will use console and database only

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || 'http://localhost:3000']
    : true,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'development-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Prometheus metrics middleware
app.use(metricsExporter.trackHTTPRequest());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: require('../package.json').version
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await metricsExporter.getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    console.error('Metrics endpoint error:', error);
    res.status(500).send('Error generating metrics');
  }
});

// Authentication routes
app.use('/api/auth', authRoutes);

// User profile routes
app.use('/api/user', userRoutes);

// Stage 3 API integration routes
app.use('/api', apiRoutes);

// Stage 4 theming routes
app.use('/api/theming', themingRoutes);

// Stage 4 plugins routes
app.use('/api/plugins', pluginsRoutes);

// Stage 5 admin routes
app.use('/api/admin', adminRoutes);

// Stage 6 dashboard routes
app.use('/api/dashboard', dashboardRoutes);

// Audit logging routes
app.get('/api/audit/logs', async (req, res) => {
  try {
    const logs = await auditLogger.getAuditLogs({
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
      event_type: req.query.event_type,
      user_id: req.query.user_id
    });
    res.json(logs);
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

app.post('/api/audit/log', async (req, res) => {
  try {
    const entry = await auditLogger.log({
      ...req.body,
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
    res.json({ success: true, entry });
  } catch (error) {
    console.error('Create audit log error:', error);
    res.status(500).json({ error: 'Failed to create audit log' });
  }
});

// API status endpoint (updated for Stage 6)
app.get('/api/status', (req, res) => {
  res.json({
    message: 'Site Template API is running',
    stage: 'Stage 6 - Advanced User Experience',
    features: {
      authentication: true,
      userProfiles: true,
      notificationPreferences: true,
      externalApiIntegration: true,
      dataTransformation: true,
      redis: true,
      automatedDataFetching: true,
      kpiCalculations: true,
      errorMonitoring: true,
      database: true,
      rbac: true,
      auditLogging: true,
      userActivity: true,
      themingSystem: true,
      brandProfiles: true,
      pluginSystem: true,
      featureFlags: true,
      dynamicNavigation: true,
      hotSwappableThemes: true,
      adminDashboard: true,
      userAnalytics: true,
      systemMetrics: true,
      abTesting: true,
      userManagement: true,
      realTimeAnalytics: true,
      // Stage 6 features
      modularDashboards: true,
      widgetSystem: true,
      realTimeStreaming: true,
      websocketAlerts: true,
      d3Visualizations: true,
      microfrontends: true
    }
  });
});

// Always serve static files from build directory
app.use(express.static(path.join(__dirname, '../build')));

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../build/index.html');
  
  // Check if build exists, otherwise serve development message
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      message: 'Build not found - Run npm run build to create production build',
      availableEndpoints: [
        'GET /health - Health check',
        'GET /api/status - API status'
      ],
      note: 'React development server should be running on port 3001'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong!' 
      : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Initialize Stage 3, 4, 5 & 6 services
async function initializeServices() {
  try {
    console.log('Initializing Stage 3, 4, 5 & 6 services...');
    
    // Stage 3: Initialize automated data fetcher
    const dataFetcherInit = await dataFetcher.initialize();
    if (dataFetcherInit.success) {
      console.log('✅ Automated data fetcher initialized');
    } else {
      console.warn('⚠️  Automated data fetcher initialization failed:', dataFetcherInit.error);
    }
    
    // Stage 4: Initialize plugin system
    const pluginInit = await pluginService.initializeEnabledPlugins();
    if (pluginInit.success) {
      const loadedCount = pluginInit.data.filter(p => p.success).length;
      console.log(`✅ Plugin system initialized - ${loadedCount} plugins loaded`);
    } else {
      console.warn('⚠️  Plugin system initialization failed:', pluginInit.error);
    }
    
    // Stage 5: Initialize analytics and A/B testing
    const analyticsHealth = await analyticsService.healthCheck();
    if (analyticsHealth.status === 'healthy') {
      console.log('✅ Analytics service initialized');
    } else {
      console.warn('⚠️  Analytics service initialization failed:', analyticsHealth.error);
    }

    const abTestingHealth = await abTestingService.healthCheck();
    if (abTestingHealth.status === 'healthy') {
      console.log('✅ A/B testing service initialized');
    } else {
      console.warn('⚠️  A/B testing service initialization failed:', abTestingHealth.error);
    }
    
    // Stage 6: Initialize dashboard and WebSocket services
    const dashboardHealth = await dashboardService.healthCheck();
    if (dashboardHealth.status === 'healthy') {
      console.log('✅ Dashboard service initialized');
    } else {
      console.warn('⚠️  Dashboard service initialization failed:', dashboardHealth.error);
    }

    const websocketHealth = await websocketService.healthCheck();
    if (websocketHealth.status === 'healthy') {
      console.log('✅ WebSocket service initialized');
    } else {
      console.warn('⚠️  WebSocket service initialization failed:', websocketHealth.error);
    }
    
    console.log('Services initialization complete');
  } catch (error) {
    console.error('❌ Services initialization failed:', error);
    await errorMonitor.logError(error, { context: 'service_initialization' });
  }
}

// Create HTTP server for WebSocket integration
const server = createServer(app);

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/socket.io`);
  
  // Initialize services after server starts
  await initializeServices();
  
  // Initialize WebSocket service
  websocketService.initialize(server);
});
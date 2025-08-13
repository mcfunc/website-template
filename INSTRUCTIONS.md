# AI Agent Instructions for Site Template Extension

This document provides comprehensive instructions for AI agents to easily adopt, extend, and add templates and modules to the Site Template system.

## Table of Contents

1. [Quick Start for AI Agents](#quick-start-for-ai-agents)
2. [Architecture Overview](#architecture-overview)
3. [Adding New Modules](#adding-new-modules)
4. [Creating Custom Widgets](#creating-custom-widgets)
5. [Extending the Database Schema](#extending-the-database-schema)
6. [Adding New API Endpoints](#adding-new-api-endpoints)
7. [Creating Page Templates](#creating-page-templates)
8. [Theming and Styling](#theming-and-styling)
9. [Testing and Deployment](#testing-and-deployment)
10. [Best Practices](#best-practices)

## Quick Start for AI Agents

### Prerequisites
- Examine the existing codebase structure in this repo
- Review `CLAUDE.md` for project guidelines and stage information
- Understand the Docker-based deployment architecture

### Key Commands for Development
```bash
# Start the full stack
./deploy.sh restart

# Work with webapp only
cd webapp
npm run dev          # Development server
npm run build        # Production build
npm run lint         # Code linting
npm run typecheck    # TypeScript checking

# Database operations
docker-compose exec postgres psql -U siteuser -d sitedb
```

## Architecture Overview

### Directory Structure
```
site-template/
├── webapp/                 # React frontend application
│   ├── src/
│   │   ├── components/     # Reusable React components
│   │   │   ├── dashboard/  # Dashboard widgets and canvas
│   │   │   ├── analytics/  # D3.js visualization components
│   │   │   ├── modules/    # Micro-frontend module loader
│   │   │   └── admin/      # Admin interface components
│   │   ├── pages/          # Page-level components
│   │   ├── services/       # API and business logic services
│   │   ├── context/        # React context providers
│   │   ├── modules/        # Micro-frontend modules
│   │   └── styles/         # CSS and styling files
├── database/               # Database schemas and migrations
│   └── init/              # SQL initialization files
├── nginx/                  # Reverse proxy configuration
├── monitoring/             # Prometheus and Grafana configs
└── docs/                   # Documentation files
```

### Technology Stack
- **Frontend**: React, D3.js, Chart.js, Socket.IO Client, React Grid Layout
- **Backend**: Node.js, Express, Socket.IO Server
- **Database**: PostgreSQL with Redis caching
- **Infrastructure**: Docker, Nginx, Prometheus, Grafana
- **Real-time**: WebSocket communication for live updates

## Adding New Modules

### 1. Micro-Frontend Module Structure

Create a new module in `webapp/src/modules/`:

```javascript
// webapp/src/modules/YourModuleName.js
import React, { useState, useEffect } from 'react';

const YourModuleComponent = ({ config = {}, context = {} }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Default configuration
  const {
    title = 'Your Module',
    refreshInterval = 30000,
    theme = 'light'
  } = config;

  useEffect(() => {
    // Module initialization logic
    const initializeModule = async () => {
      setLoading(true);
      try {
        // Fetch data, setup listeners, etc.
        const moduleData = await fetchModuleData();
        setData(moduleData);
      } catch (error) {
        console.error('Module initialization failed:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeModule();
  }, []);

  // Emit events to parent application
  useEffect(() => {
    if (context.emit && data) {
      context.emit('dataUpdated', {
        moduleId: context.moduleId,
        data
      });
    }
  }, [data, context]);

  const fetchModuleData = async () => {
    // Implement your data fetching logic
    return { example: 'data' };
  };

  if (loading) {
    return <div className="module-loading">Loading {title}...</div>;
  }

  return (
    <div className={`your-module theme-${theme}`}>
      <h3>{title}</h3>
      {/* Your module content */}
      <div className="module-content">
        {JSON.stringify(data, null, 2)}
      </div>
    </div>
  );
};

// Module factory function
const YourModuleFactory = (context) => {
  return {
    Component: YourModuleComponent,
    name: 'Your Module Name',
    version: '1.0.0',
    type: 'widget', // or 'page', 'utility', 'integration'
    
    render: (config) => React.createElement(YourModuleComponent, { config, context }),
    
    updateConfig: async (newConfig) => {
      if (context.emit) {
        context.emit('configUpdated', newConfig);
      }
    },
    
    cleanup: () => {
      console.log('Module cleanup');
    },
    
    capabilities: ['data-display', 'real-time', 'configurable'],
    
    configSchema: {
      title: { type: 'string', default: 'Your Module' },
      refreshInterval: { type: 'number', default: 30000, min: 5000 },
      theme: { type: 'string', enum: ['light', 'dark'], default: 'light' }
    }
  };
};

export default YourModuleFactory;
export { YourModuleComponent };
```

### 2. Register the Module

Add registration in the appropriate admin interface or via API:

```javascript
// Register via ModuleManager or API call
const moduleConfig = {
  id: 'your-module-id',
  name: 'Your Module Name',
  version: '1.0.0',
  entryPoint: './modules/YourModuleName.js',
  category: 'analytics', // or 'widget', 'integration', 'admin'
  description: 'Description of what your module does',
  dependencies: [], // Array of required module IDs
  config: {
    title: 'Default Title',
    refreshInterval: 30000
  }
};

await moduleRegistryService.registerModule(moduleConfig);
```

## Creating Custom Widgets

### 1. Dashboard Widget Template

```javascript
// webapp/src/components/dashboard/widgets/YourWidget.js
import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import './YourWidget.css';

const YourWidget = ({ config, widgetId, onDataUpdate }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // WebSocket connection for real-time updates
  const { socket, isConnected } = useWebSocket();

  const {
    title = 'Your Widget',
    dataSource = 'default',
    updateInterval = 30000,
    displayMode = 'card'
  } = config;

  useEffect(() => {
    // Subscribe to real-time updates
    if (socket) {
      socket.on(`widget:${widgetId}:update`, handleDataUpdate);
      socket.emit('subscribe', { widgetId, dataSource });
    }

    return () => {
      if (socket) {
        socket.off(`widget:${widgetId}:update`, handleDataUpdate);
        socket.emit('unsubscribe', { widgetId });
      }
    };
  }, [socket, widgetId, dataSource]);

  const handleDataUpdate = (newData) => {
    setData(newData);
    setError(null);
    if (onDataUpdate) {
      onDataUpdate(widgetId, newData);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/widgets/${widgetId}/data`);
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    if (updateInterval > 0) {
      const interval = setInterval(fetchData, updateInterval);
      return () => clearInterval(interval);
    }
  }, [updateInterval]);

  if (loading) {
    return (
      <div className="widget-container loading">
        <div className="loading-spinner"></div>
        <p>Loading {title}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="widget-container error">
        <h4>Error</h4>
        <p>{error}</p>
        <button onClick={fetchData}>Retry</button>
      </div>
    );
  }

  return (
    <div className={`widget-container your-widget display-${displayMode}`}>
      <div className="widget-header">
        <h4>{title}</h4>
        <div className="widget-status">
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢' : '🔴'}
          </span>
        </div>
      </div>
      
      <div className="widget-content">
        {/* Your widget-specific content */}
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
      
      <div className="widget-footer">
        <small>Last updated: {new Date().toLocaleTimeString()}</small>
      </div>
    </div>
  );
};

export default YourWidget;
```

### 2. Widget Registration

Add to the widget registry in `webapp/src/components/dashboard/widgets/index.js`:

```javascript
import YourWidget from './YourWidget';

export const AVAILABLE_WIDGETS = {
  // ... existing widgets
  'your-widget': {
    component: YourWidget,
    name: 'Your Widget',
    description: 'Custom widget description',
    category: 'analytics',
    defaultConfig: {
      title: 'Your Widget',
      dataSource: 'default',
      updateInterval: 30000,
      displayMode: 'card'
    },
    configSchema: {
      title: { type: 'string' },
      dataSource: { type: 'select', options: ['default', 'api', 'websocket'] },
      updateInterval: { type: 'number', min: 5000 },
      displayMode: { type: 'select', options: ['card', 'compact', 'detailed'] }
    }
  }
};
```

## Extending the Database Schema

### 1. Create Migration File

Create a new SQL file in `database/init/`:

```sql
-- database/init/008-your-feature-schema.sql

-- Create new schemas if needed
CREATE SCHEMA IF NOT EXISTS your_feature;

-- Create tables for your feature
CREATE TABLE your_feature.your_table (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    configuration JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_your_table_user_id ON your_feature.your_table(user_id);
CREATE INDEX idx_your_table_status ON your_feature.your_table(status);
CREATE INDEX idx_your_table_created_at ON your_feature.your_table(created_at);

-- Create functions for your feature
CREATE OR REPLACE FUNCTION your_feature.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_update_your_table_timestamp
    BEFORE UPDATE ON your_feature.your_table
    FOR EACH ROW
    EXECUTE FUNCTION your_feature.update_timestamp();

-- Insert default data if needed
INSERT INTO your_feature.your_table (name, configuration) VALUES
    ('Default Item', '{"enabled": true, "settings": {}}');

-- Add permissions to existing roles
GRANT USAGE ON SCHEMA your_feature TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA your_feature TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA your_feature TO app_user;
```

### 2. Update Existing Tables (if needed)

```sql
-- Add columns to existing tables
ALTER TABLE dashboards.user_dashboards 
ADD COLUMN IF NOT EXISTS your_feature_enabled BOOLEAN DEFAULT false;

-- Create junction tables for relationships
CREATE TABLE your_feature.user_feature_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_id INTEGER REFERENCES your_feature.your_table(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, feature_id)
);
```

## Adding New API Endpoints

### 1. Create Service File

```javascript
// webapp/src/services/yourFeatureService.js
import axios from 'axios';

class YourFeatureService {
  constructor() {
    this.baseURL = '/api/your-feature';
  }

  async getItems(filters = {}) {
    try {
      const params = new URLSearchParams(filters);
      const response = await axios.get(`${this.baseURL}/items?${params}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch items: ${error.message}`);
    }
  }

  async createItem(itemData) {
    try {
      const response = await axios.post(`${this.baseURL}/items`, itemData);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create item: ${error.message}`);
    }
  }

  async updateItem(itemId, updateData) {
    try {
      const response = await axios.put(`${this.baseURL}/items/${itemId}`, updateData);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update item: ${error.message}`);
    }
  }

  async deleteItem(itemId) {
    try {
      await axios.delete(`${this.baseURL}/items/${itemId}`);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete item: ${error.message}`);
    }
  }

  async subscribeToUpdates(callback) {
    // WebSocket subscription for real-time updates
    const socket = window.io ? window.io() : null;
    if (socket) {
      socket.on('your-feature:update', callback);
      return () => socket.off('your-feature:update', callback);
    }
    return null;
  }
}

export default new YourFeatureService();
```

### 2. Create Route Handler

```javascript
// webapp/src/routes/yourFeature.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const auth = require('../middleware/auth');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET /api/your-feature/items
router.get('/items', auth.authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const userId = req.user.id;

    let query = `
      SELECT id, name, configuration, status, created_at, updated_at
      FROM your_feature.your_table
      WHERE user_id = $1
    `;
    const params = [userId];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({
      items: result.rows,
      total: result.rowCount,
      page: Math.floor(offset / limit) + 1
    });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST /api/your-feature/items
router.post('/items', auth.authenticateToken, async (req, res) => {
  try {
    const { name, configuration } = req.body;
    const userId = req.user.id;

    const result = await pool.query(
      `INSERT INTO your_feature.your_table (user_id, name, configuration)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, name, configuration || {}]
    );

    // Emit real-time update
    req.io?.emit('your-feature:update', {
      type: 'item_created',
      item: result.rows[0],
      userId
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /api/your-feature/items/:id
router.put('/items/:id', auth.authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, configuration, status } = req.body;
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE your_feature.your_table
       SET name = COALESCE($1, name),
           configuration = COALESCE($2, configuration),
           status = COALESCE($3, status),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, configuration, status, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Emit real-time update
    req.io?.emit('your-feature:update', {
      type: 'item_updated',
      item: result.rows[0],
      userId
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/your-feature/items/:id
router.delete('/items/:id', auth.authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `DELETE FROM your_feature.your_table
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Emit real-time update
    req.io?.emit('your-feature:update', {
      type: 'item_deleted',
      itemId: id,
      userId
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
```

### 3. Register Routes

Add to `webapp/src/server.js`:

```javascript
// Import your route handler
const yourFeatureRoutes = require('./routes/yourFeature');

// Register routes
app.use('/api/your-feature', yourFeatureRoutes);
```

## Creating Page Templates

### 1. Page Component Template

```javascript
// webapp/src/pages/YourPage.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import YourFeatureService from '../services/yourFeatureService';
import './YourPage.css';

const YourPage = () => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check permissions
  useEffect(() => {
    if (!hasPermission('your-feature:read')) {
      navigate('/dashboard');
      return;
    }
  }, [hasPermission, navigate]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const result = await YourFeatureService.getItems();
        setData(result.items || []);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to real-time updates
    const unsubscribe = YourFeatureService.subscribeToUpdates((update) => {
      handleRealTimeUpdate(update);
    });

    return unsubscribe;
  }, []);

  const handleRealTimeUpdate = (update) => {
    switch (update.type) {
      case 'item_created':
        setData(prev => [update.item, ...prev]);
        break;
      case 'item_updated':
        setData(prev => prev.map(item => 
          item.id === update.item.id ? update.item : item
        ));
        break;
      case 'item_deleted':
        setData(prev => prev.filter(item => item.id !== update.itemId));
        break;
      default:
        break;
    }
  };

  const handleCreate = async (itemData) => {
    try {
      await YourFeatureService.createItem(itemData);
      // Real-time update will handle UI refresh
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdate = async (itemId, updateData) => {
    try {
      await YourFeatureService.updateItem(itemId, updateData);
      // Real-time update will handle UI refresh
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (itemId) => {
    try {
      await YourFeatureService.deleteItem(itemId);
      // Real-time update will handle UI refresh
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="your-page loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="your-page error">
        <div className="error-container">
          <h3>Error</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="your-page">
      <div className="page-header">
        <h1>Your Feature</h1>
        <p>Manage your feature items</p>
        <button onClick={() => handleCreate({ name: 'New Item' })}>
          Add New Item
        </button>
      </div>

      <div className="page-content">
        <div className="items-grid">
          {data.map(item => (
            <div key={item.id} className="item-card">
              <h3>{item.name}</h3>
              <p>Status: {item.status}</p>
              <div className="item-actions">
                <button onClick={() => handleUpdate(item.id, { status: 'updated' })}>
                  Update
                </button>
                <button onClick={() => handleDelete(item.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default YourPage;
```

### 2. Add Route to App.js

```javascript
// In webapp/src/App.js
import YourPage from './pages/YourPage';

// Add route in the Routes component
<Route 
  path="/your-feature" 
  element={
    <ProtectedRoute requiredPermissions={['your-feature:read']}>
      <YourPage />
    </ProtectedRoute>
  } 
/>
```

## Theming and Styling

### 1. CSS Module Template

```css
/* webapp/src/pages/YourPage.css */
.your-page {
  min-height: calc(100vh - 64px);
  background: var(--bg-primary, #f8fafc);
  padding: 2rem;
}

.your-page.loading,
.your-page.error {
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-header {
  margin-bottom: 2rem;
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1 {
  margin: 0;
  color: var(--text-primary, #1e293b);
  font-size: 2rem;
  font-weight: 600;
}

.page-header p {
  margin: 0.5rem 0 0 0;
  color: var(--text-secondary, #64748b);
}

.page-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.item-card {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.item-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.item-card h3 {
  margin: 0 0 1rem 0;
  color: var(--text-primary, #1e293b);
  font-size: 1.25rem;
  font-weight: 600;
}

.item-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.item-actions button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.item-actions button:first-child {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.item-actions button:first-child:hover {
  background: var(--primary-hover, #2563eb);
}

.item-actions button:last-child {
  background: var(--danger-color, #dc2626);
  color: white;
}

.item-actions button:last-child:hover {
  background: var(--danger-hover, #b91c1c);
}

/* Dark theme support */
[data-theme="dark"] .your-page {
  --bg-primary: #0f172a;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
}

[data-theme="dark"] .page-header,
[data-theme="dark"] .item-card {
  background: #1e293b;
  color: var(--text-primary);
}

/* Responsive design */
@media (max-width: 768px) {
  .your-page {
    padding: 1rem;
  }
  
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .items-grid {
    grid-template-columns: 1fr;
  }
}
```

### 2. Theme Integration

Use CSS custom properties and theme context:

```javascript
// Access theme in components
import { useTheme } from '../components/ThemeProvider';

const YourComponent = () => {
  const { theme, setTheme } = useTheme();
  
  return (
    <div className={`your-component theme-${theme}`}>
      {/* Component content */}
    </div>
  );
};
```

## Testing and Deployment

### 1. Component Testing Template

```javascript
// webapp/src/__tests__/YourComponent.test.js
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import YourComponent from '../components/YourComponent';

// Mock services
jest.mock('../services/yourFeatureService', () => ({
  getItems: jest.fn(() => Promise.resolve({ items: [] })),
  createItem: jest.fn(() => Promise.resolve({ id: 1 })),
  subscribeToUpdates: jest.fn(() => () => {})
}));

const TestWrapper = ({ children }) => (
  <BrowserRouter>
    <AuthProvider>
      {children}
    </AuthProvider>
  </BrowserRouter>
);

describe('YourComponent', () => {
  test('renders without crashing', () => {
    render(
      <TestWrapper>
        <YourComponent />
      </TestWrapper>
    );
    
    expect(screen.getByText(/your component/i)).toBeInTheDocument();
  });

  test('handles user interaction', async () => {
    render(
      <TestWrapper>
        <YourComponent />
      </TestWrapper>
    );
    
    const button = screen.getByText(/click me/i);
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText(/result/i)).toBeInTheDocument();
    });
  });
});
```

### 2. Deployment Checklist

```bash
# 1. Test the build
cd webapp
npm run build

# 2. Check for lint errors
npm run lint

# 3. Run type checking
npm run typecheck

# 4. Test database migrations
docker-compose exec postgres psql -U siteuser -d sitedb -f /docker-entrypoint-initdb.d/008-your-feature-schema.sql

# 5. Deploy with rebuild
cd ..
./deploy.sh restart

# 6. Verify health
curl http://localhost:3000/health

# 7. Test specific endpoints
curl http://localhost:3000/api/your-feature/items \
  -H "Authorization: Bearer your-token"
```

## Best Practices

### 1. Code Organization
- **Separation of Concerns**: Keep business logic in services, UI logic in components
- **Consistent Naming**: Use clear, descriptive names following existing patterns
- **Modular Architecture**: Create reusable components and services
- **Type Safety**: Use proper TypeScript types where applicable

### 2. Performance
- **Lazy Loading**: Use React.lazy() for large components
- **Memoization**: Use React.memo(), useMemo(), useCallback() appropriately
- **Real-time Updates**: Implement WebSocket efficiently to avoid memory leaks
- **Database Indexing**: Add proper indexes for query performance

### 3. Security
- **Authentication**: Always check user permissions before accessing resources
- **Input Validation**: Validate all user inputs on both client and server
- **SQL Injection**: Use parameterized queries for database operations
- **XSS Prevention**: Sanitize any user-generated content

### 4. Error Handling
- **Graceful Degradation**: Provide fallbacks for failed operations
- **User Feedback**: Show clear error messages and loading states
- **Logging**: Log errors for debugging without exposing sensitive data
- **Recovery**: Provide retry mechanisms for transient failures

### 5. Documentation
- **Code Comments**: Document complex logic and business rules
- **API Documentation**: Keep endpoint documentation up to date
- **Component Props**: Document component interfaces and usage
- **Change Log**: Document changes and their impact

## Common Patterns

### 1. Service Pattern
```javascript
// Create services for external integrations
class ExternalAPIService {
  constructor(baseURL, apiKey) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
  }

  async fetchData(endpoint, params = {}) {
    // Implementation with error handling, retries, caching
  }
}
```

### 2. Hook Pattern
```javascript
// Create custom hooks for reusable logic
function useYourFeature(config) {
  const [state, setState] = useState(initialState);
  
  useEffect(() => {
    // Setup and cleanup logic
  }, [config]);

  return { state, actions };
}
```

### 3. Context Pattern
```javascript
// Create contexts for shared state
const YourFeatureContext = createContext();

export const YourFeatureProvider = ({ children }) => {
  // State and methods
  return (
    <YourFeatureContext.Provider value={value}>
      {children}
    </YourFeatureContext.Provider>
  );
};
```

---

This template system is designed to be highly extensible and maintainable. Follow these patterns and practices to ensure your additions integrate seamlessly with the existing architecture.

For questions or clarifications about specific implementation details, refer to the existing codebase examples and the CLAUDE.md file for project-specific guidelines.

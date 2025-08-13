const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

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

const pool = new Pool({
  ...poolConfig,
  ssl: false,
});

const JWT_SECRET = process.env.JWT_SECRET || 'development-jwt-secret';

// Middleware to authenticate JWT tokens
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'MISSING_TOKEN' 
    });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user exists in database
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM auth.users WHERE id = $1 AND active = true',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ 
          error: 'Invalid token - user not found',
          code: 'USER_NOT_FOUND' 
        });
      }

      // Add user info to request
      req.user = {
        id: decoded.userId,
        email: result.rows[0].email,
        name: result.rows[0].name,
        roles: result.rows[0].roles || [],
        permissions: result.rows[0].permissions || []
      };

      next();
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED' 
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN' 
      });
    } else {
      console.error('Authentication error:', error);
      return res.status(500).json({ 
        error: 'Authentication service error',
        code: 'AUTH_SERVICE_ERROR' 
      });
    }
  }
};

// Middleware to check user permissions
const requirePermissions = (requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED' 
      });
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = requiredPermissions.some(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        error: `Insufficient permissions. Required: ${requiredPermissions.join(' or ')}`,
        code: 'INSUFFICIENT_PERMISSIONS',
        required: requiredPermissions,
        current: userPermissions
      });
    }

    next();
  };
};

// Middleware to check user roles
const requireRoles = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED' 
      });
    }

    const userRoles = req.user.roles || [];
    const hasRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ 
        error: `Insufficient roles. Required: ${requiredRoles.join(' or ')}`,
        code: 'INSUFFICIENT_ROLES',
        required: requiredRoles,
        current: userRoles
      });
    }

    next();
  };
};

// Middleware for admin-only access
const requireAdmin = requireRoles(['admin']);

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM auth.users WHERE id = $1 AND active = true',
        [decoded.userId]
      );

      if (result.rows.length > 0) {
        req.user = {
          id: decoded.userId,
          email: result.rows[0].email,
          name: result.rows[0].name,
          roles: result.rows[0].roles || [],
          permissions: result.rows[0].permissions || []
        };
      } else {
        req.user = null;
      }
    } finally {
      client.release();
    }
  } catch (error) {
    // If token is invalid, just set user to null
    req.user = null;
  }

  next();
};

// Generate JWT token
const generateToken = (userId, expiresIn = '24h') => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
};

// Verify JWT token (utility function)
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateToken,
  requirePermissions,
  requireRoles,
  requireAdmin,
  optionalAuth,
  generateToken,
  verifyToken
};
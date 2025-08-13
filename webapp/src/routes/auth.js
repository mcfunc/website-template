const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const crypto = require('crypto');
const router = express.Router();

// Database connection (will be implemented in task 1.2)
const db = require('../services/database');
const auditLogger = require('../services/auditLogger');

// Initialize Passport with Auth0 Strategy (optional)
if (process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET) {
  passport.use(new Auth0Strategy({
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL: process.env.AUTH0_CALLBACK_URL || 'http://localhost:3000/api/auth/callback'
  }, async (accessToken, refreshToken, extraParams, profile, done) => {
  try {
    // Find or create user in database
    let user = await db.findUserByProvider(profile.provider, profile.id);
    
    if (!user) {
      user = await db.createUser({
        provider: profile.provider,
        providerId: profile.id,
        email: profile.emails?.[0]?.value,
        name: profile.displayName,
        avatar: profile.photos?.[0]?.value,
        roles: ['user'],
        permissions: ['read:dashboard', 'write:profile'],
        metadata: {
          accessToken: accessToken,
          refreshToken: refreshToken
        }
      });

      // Log user registration
      await auditLogger.log({
        event_type: 'auth',
        action: 'register',
        user_id: user.id,
        details: {
          provider: profile.provider,
          email: user.email
        }
      });
    } else {
      // Update user tokens
      await db.updateUser(user.id, {
        metadata: {
          ...user.metadata,
          accessToken: accessToken,
          refreshToken: refreshToken,
          lastLogin: new Date()
        }
      });

      // Log user login
      await auditLogger.log({
        event_type: 'auth',
        action: 'login',
        user_id: user.id,
        details: {
          provider: profile.provider,
          email: user.email
        }
      });
    }

    return done(null, user);
  } catch (error) {
    console.error('Auth0 strategy error:', error);
    return done(error);
  }
  }));
} else {
  console.log('Auth0 configuration not provided, skipping Auth0 strategy setup');
}

// Serialize/deserialize user for session
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.findUserById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Middleware to verify JWT tokens
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    // For mock tokens (demo mode)
    if (token.startsWith('mock_token_')) {
      req.user = {
        id: 'mock_user_id',
        name: 'Mock User',
        email: 'mock@example.com',
        roles: ['user'],
        permissions: ['read:dashboard', 'write:profile']
      };
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.findUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Email/password login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Mock authentication for demo
    if (process.env.NODE_ENV === 'development') {
      const mockUser = {
        id: 'mock_user_' + Date.now(),
        name: email.split('@')[0].replace(/[^a-zA-Z]/g, ' '),
        email: email,
        provider: 'email',
        avatar: null,
        roles: ['user'],
        permissions: ['read:dashboard', 'write:profile']
      };

      const token = jwt.sign(
        { userId: mockUser.id, email: mockUser.email },
        process.env.JWT_SECRET || 'development_secret',
        { expiresIn: '24h' }
      );

      // Log login attempt
      await auditLogger.log({
        event_type: 'auth',
        action: 'login',
        user_id: mockUser.id,
        details: {
          provider: 'email',
          email: mockUser.email
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      return res.json({
        success: true,
        user: mockUser,
        token: token,
        refreshToken: 'mock_refresh_' + Date.now()
      });
    }

    // Production authentication
    const user = await db.findUserByEmail(email);
    if (!user || !await bcrypt.compare(password, user.password)) {
      // Log failed login attempt
      await auditLogger.log({
        event_type: 'auth',
        action: 'login_failed',
        details: {
          email: email,
          reason: 'Invalid credentials'
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = crypto.randomBytes(64).toString('hex');
    
    // Store refresh token
    await db.updateUser(user.id, {
      refresh_token: refreshToken,
      last_login: new Date()
    });

    // Log successful login
    await auditLogger.log({
      event_type: 'auth',
      action: 'login',
      user_id: user.id,
      details: {
        provider: 'email',
        email: user.email
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        roles: user.roles,
        permissions: user.permissions
      },
      token: token,
      refreshToken: refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Auth0 SSO login
router.get('/auth0', passport.authenticate('auth0', {
  scope: 'openid email profile'
}));

// Auth0 callback
router.get('/callback', passport.authenticate('auth0', {
  failureRedirect: '/login?error=auth_failed'
}), async (req, res) => {
  try {
    const token = jwt.sign(
      { userId: req.user.id, email: req.user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = crypto.randomBytes(64).toString('hex');
    
    // Store refresh token
    await db.updateUser(req.user.id, {
      refresh_token: refreshToken
    });

    // Redirect to frontend with tokens
    const params = new URLSearchParams({
      token: token,
      user: encodeURIComponent(JSON.stringify({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        roles: req.user.roles,
        permissions: req.user.permissions
      }))
    });

    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth-success?${params}`);
  } catch (error) {
    console.error('Callback error:', error);
    res.redirect('/login?error=callback_failed');
  }
});

// Social authentication URLs (Google, Microsoft, GitHub)
router.get('/social/:provider/url', async (req, res) => {
  try {
    const { provider } = req.params;
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state for validation
    req.session.authState = state;
    
    const authUrls = {
      google: `https://accounts.google.com/oauth/v2/auth?${new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: `${req.protocol}://${req.get('host')}/api/auth/social/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state: state
      })}`,
      microsoft: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        redirect_uri: `${req.protocol}://${req.get('host')}/api/auth/social/microsoft/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state: state
      })}`,
      github: `https://github.com/login/oauth/authorize?${new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        redirect_uri: `${req.protocol}://${req.get('host')}/api/auth/social/github/callback`,
        scope: 'user:email',
        state: state
      })}`
    };

    const authUrl = authUrls[provider];
    if (!authUrl) {
      return res.status(400).json({ error: 'Unsupported provider' });
    }

    res.json({ authUrl });
  } catch (error) {
    console.error('Social auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Token validation
router.get('/validate', verifyToken, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      roles: req.user.roles,
      permissions: req.user.permissions
    }
  });
});

// Get user profile
router.get('/profile', verifyToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
      roles: req.user.roles,
      permissions: req.user.permissions,
      provider: req.user.provider,
      created_at: req.user.created_at,
      last_login: req.user.last_login
    }
  });
});

// Token refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // For mock tokens (demo mode)
    if (refresh_token.startsWith('mock_refresh_')) {
      const newToken = jwt.sign(
        { userId: 'mock_user_id', email: 'mock@example.com' },
        process.env.JWT_SECRET || 'development_secret',
        { expiresIn: '24h' }
      );

      return res.json({
        access_token: newToken,
        refresh_token: 'mock_refresh_' + Date.now(),
        expires_in: 86400
      });
    }

    const user = await db.findUserByRefreshToken(refresh_token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const newToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    
    await db.updateUser(user.id, {
      refresh_token: newRefreshToken
    });

    res.json({
      access_token: newToken,
      refresh_token: newRefreshToken,
      expires_in: 86400
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Logout
router.post('/logout', verifyToken, async (req, res) => {
  try {
    // Log logout event
    await auditLogger.log({
      event_type: 'auth',
      action: 'logout',
      user_id: req.user.id,
      details: {
        provider: req.user.provider,
        email: req.user.email
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    // Clear refresh token
    if (req.user.id && !req.user.id.startsWith('mock_')) {
      await db.updateUser(req.user.id, {
        refresh_token: null
      });
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;
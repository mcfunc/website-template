const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const auditLogger = require('../services/auditLogger');

// Database connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'sitetemplate',
  user: process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASSWORD || 'password',
  ssl: false,
});

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

// Get user profile with preferences
router.get('/profile', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Get complete user profile
    const result = await client.query(
      'SELECT auth.get_user_profile_complete($1) as profile',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const profileData = result.rows[0].profile;
    
    // Log profile access
    await auditLogger.logDataAccess(
      req.user.userId,
      'user_profile',
      req.user.userId,
      'view',
      { endpoint: '/api/user/profile' }
    );

    res.json(profileData);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  } finally {
    client.release();
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const {
      display_name,
      bio,
      avatar_url,
      location,
      website_url,
      timezone,
      language,
      theme
    } = req.body;

    // Update profile using database function
    const result = await client.query(
      'SELECT auth.update_user_profile($1, $2, $3, $4, $5, $6, $7, $8, $9) as profile',
      [
        req.user.userId,
        display_name || null,
        bio || null,
        avatar_url || null,
        location || null,
        website_url || null,
        timezone || null,
        language || null,
        theme || null
      ]
    );

    const updatedProfile = result.rows[0].profile;

    // Log profile update
    await auditLogger.logUserUpdated(req.user.userId, req.user.userId, {
      updated_fields: Object.keys(req.body),
      endpoint: '/api/user/profile'
    });

    // Log user activity
    await client.query(
      'SELECT auth.log_user_activity($1, $2, $3, $4, $5)',
      [
        req.user.userId,
        'profile_updated',
        JSON.stringify({ updated_fields: Object.keys(req.body) }),
        req.ip,
        req.get('User-Agent')
      ]
    );

    res.json(updatedProfile);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  } finally {
    client.release();
  }
});

// Update notification preferences
router.put('/notifications', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const preferences = req.body;

    // Update notification preferences using database function
    const result = await client.query(
      'SELECT auth.update_notification_preferences($1, $2) as preferences',
      [req.user.userId, JSON.stringify(preferences)]
    );

    const updatedPreferences = result.rows[0].preferences;

    // Log notification preferences update
    await auditLogger.log({
      event_type: 'user',
      action: 'notification_preferences_updated',
      user_id: req.user.userId,
      resource_type: 'user',
      resource_id: req.user.userId,
      details: {
        updated_preferences: Object.keys(preferences),
        endpoint: '/api/user/notifications'
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    // Log user activity
    await client.query(
      'SELECT auth.log_user_activity($1, $2, $3, $4, $5)',
      [
        req.user.userId,
        'notification_preferences_updated',
        JSON.stringify({ updated_preferences: Object.keys(preferences) }),
        req.ip,
        req.get('User-Agent')
      ]
    );

    res.json(updatedPreferences);
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  } finally {
    client.release();
  }
});

// Get user activity history
router.get('/activity', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const activityType = req.query.type;

    let query = `
      SELECT 
        id, 
        activity_type, 
        activity_data, 
        ip_address, 
        created_at
      FROM auth.user_activity 
      WHERE user_id = $1
    `;
    
    const params = [req.user.userId];
    let paramIndex = 2;

    if (activityType) {
      query += ` AND activity_type = $${paramIndex++}`;
      params.push(activityType);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await client.query(query, params);

    // Log activity access
    await auditLogger.logDataAccess(
      req.user.userId,
      'user_activity',
      req.user.userId,
      'view',
      { endpoint: '/api/user/activity', filter: activityType }
    );

    res.json({
      activities: result.rows,
      total: result.rowCount,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ error: 'Failed to retrieve user activity' });
  } finally {
    client.release();
  }
});

// Get user statistics
router.get('/stats', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_activities,
        COUNT(DISTINCT activity_type) as unique_activity_types,
        MAX(created_at) as last_activity,
        MIN(created_at) as first_activity,
        json_object_agg(activity_type, activity_count) as activities_by_type
      FROM (
        SELECT 
          activity_type,
          created_at,
          COUNT(*) as activity_count
        FROM auth.user_activity 
        WHERE user_id = $1
        GROUP BY activity_type, created_at
      ) stats
    `;

    const result = await client.query(statsQuery, [req.user.userId]);
    const stats = result.rows[0];

    // Get profile completion percentage
    const profileQuery = `
      SELECT 
        CASE WHEN display_name IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN bio IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN location IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN website_url IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN avatar_url IS NOT NULL THEN 1 ELSE 0 END as completed_fields
      FROM auth.user_profiles 
      WHERE user_id = $1
    `;

    const profileResult = await client.query(profileQuery, [req.user.userId]);
    const profileCompletion = profileResult.rows.length > 0 
      ? Math.round((profileResult.rows[0].completed_fields / 5) * 100) 
      : 0;

    // Log stats access
    await auditLogger.logDataAccess(
      req.user.userId,
      'user_stats',
      req.user.userId,
      'view',
      { endpoint: '/api/user/stats' }
    );

    res.json({
      ...stats,
      profile_completion: profileCompletion
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve user statistics' });
  } finally {
    client.release();
  }
});

// Delete user account (soft delete)
router.delete('/account', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Soft delete user (mark as inactive)
    await client.query(
      'UPDATE auth.users SET active = false, updated_at = NOW() WHERE id = $1',
      [req.user.userId]
    );

    // Log account deletion
    await auditLogger.logUserDeleted(req.user.userId, req.user.userId);

    // Log user activity
    await client.query(
      'SELECT auth.log_user_activity($1, $2, $3, $4, $5)',
      [
        req.user.userId,
        'account_deleted',
        JSON.stringify({ soft_delete: true }),
        req.ip,
        req.get('User-Agent')
      ]
    );

    await client.query('COMMIT');

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  } finally {
    client.release();
  }
});

module.exports = router;
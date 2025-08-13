const { Pool } = require('pg');
const crypto = require('crypto');

class DatabaseService {
  constructor() {
    // Use DATABASE_URL if available, otherwise individual env vars
    const poolConfig = process.env.DATABASE_URL 
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'sitetemplate',
          user: process.env.POSTGRES_USER || 'admin',
          password: process.env.POSTGRES_PASSWORD || 'password'
        };
    
    this.pool = new Pool({
      ...poolConfig,
      ssl: false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.encryptionKey = process.env.ENCRYPTION_KEY || 'development_encryption_key_32_chars';
    this.algorithm = 'aes-256-gcm';
  }

  // Encryption/Decryption utilities
  encrypt(text) {
    if (!text) return null;
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
    cipher.setAAD(Buffer.from('sitetemplate', 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encryptedData) {
    if (!encryptedData || !encryptedData.encrypted) return null;
    
    try {
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      decipher.setAAD(Buffer.from('sitetemplate', 'utf8'));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return null;
    }
  }

  // User management
  async createUser(userData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const userId = crypto.randomUUID();
      
      // Encrypt sensitive data
      const encryptedEmail = userData.email ? this.encrypt(userData.email) : null;
      const encryptedMetadata = userData.metadata ? this.encrypt(JSON.stringify(userData.metadata)) : null;
      
      const userQuery = `
        INSERT INTO auth.users (
          id, provider, provider_id, name, avatar, roles, permissions, 
          encrypted_email, encrypted_metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING id, created_at
      `;
      
      const userResult = await client.query(userQuery, [
        userId,
        userData.provider,
        userData.providerId,
        userData.name,
        userData.avatar,
        userData.roles || ['user'],
        userData.permissions || ['read:dashboard'],
        encryptedEmail,
        encryptedMetadata
      ]);

      // Log user creation in audit log
      await client.query(`
        SELECT audit.create_audit_entry($1, $2, $3, $4, $5, $6)
      `, [
        'user',
        userId,
        'user',
        userId,
        'created',
        JSON.stringify({
          provider: userData.provider,
          roles: userData.roles || ['user']
        })
      ]);

      await client.query('COMMIT');

      return {
        id: userId,
        name: userData.name,
        email: userData.email,
        avatar: userData.avatar,
        provider: userData.provider,
        roles: userData.roles || ['user'],
        permissions: userData.permissions || ['read:dashboard'],
        created_at: userResult.rows[0].created_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create user error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserById(userId) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT id, provider, provider_id, name, avatar, roles, permissions,
               encrypted_email, encrypted_metadata, created_at, updated_at, last_login
        FROM auth.users 
        WHERE id = $1
      `;
      
      const result = await client.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      
      return {
        id: user.id,
        name: user.name,
        email: user.encrypted_email ? this.decrypt(user.encrypted_email) : null,
        avatar: user.avatar,
        provider: user.provider,
        providerId: user.provider_id,
        roles: user.roles,
        permissions: user.permissions,
        metadata: user.encrypted_metadata ? JSON.parse(this.decrypt(user.encrypted_metadata) || '{}') : {},
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login
      };
    } catch (error) {
      console.error('Find user by ID error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(email) {
    const client = await this.pool.connect();
    
    try {
      // Since email is encrypted, we need to check all users (not ideal for production)
      // In production, you'd want a more efficient approach like hashed email lookup
      const query = `
        SELECT id, provider, provider_id, name, avatar, roles, permissions,
               encrypted_email, encrypted_metadata, created_at, updated_at, last_login
        FROM auth.users
      `;
      
      const result = await client.query(query);
      
      for (const row of result.rows) {
        const decryptedEmail = row.encrypted_email ? this.decrypt(row.encrypted_email) : null;
        if (decryptedEmail === email) {
          return {
            id: row.id,
            name: row.name,
            email: decryptedEmail,
            avatar: row.avatar,
            provider: row.provider,
            providerId: row.provider_id,
            roles: row.roles,
            permissions: row.permissions,
            metadata: row.encrypted_metadata ? JSON.parse(this.decrypt(row.encrypted_metadata) || '{}') : {},
            created_at: row.created_at,
            updated_at: row.updated_at,
            last_login: row.last_login
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Find user by email error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByProvider(provider, providerId) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT id, provider, provider_id, name, avatar, roles, permissions,
               encrypted_email, encrypted_metadata, created_at, updated_at, last_login
        FROM auth.users 
        WHERE provider = $1 AND provider_id = $2
      `;
      
      const result = await client.query(query, [provider, providerId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      
      return {
        id: user.id,
        name: user.name,
        email: user.encrypted_email ? this.decrypt(user.encrypted_email) : null,
        avatar: user.avatar,
        provider: user.provider,
        providerId: user.provider_id,
        roles: user.roles,
        permissions: user.permissions,
        metadata: user.encrypted_metadata ? JSON.parse(this.decrypt(user.encrypted_metadata) || '{}') : {},
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login
      };
    } catch (error) {
      console.error('Find user by provider error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateUser(userId, updateData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const updates = [];
      const values = [];
      let valueIndex = 1;

      // Handle encrypted fields
      if (updateData.email) {
        updates.push(`encrypted_email = $${valueIndex++}`);
        values.push(this.encrypt(updateData.email));
      }

      if (updateData.metadata) {
        updates.push(`encrypted_metadata = $${valueIndex++}`);
        values.push(this.encrypt(JSON.stringify(updateData.metadata)));
      }

      // Handle non-encrypted fields
      const directFields = ['name', 'avatar', 'roles', 'permissions', 'refresh_token', 'last_login'];
      directFields.forEach(field => {
        if (updateData[field] !== undefined) {
          updates.push(`${field} = $${valueIndex++}`);
          values.push(updateData[field]);
        }
      });

      if (updates.length === 0) {
        return null;
      }

      updates.push(`updated_at = NOW()`);
      values.push(userId);

      const query = `
        UPDATE auth.users 
        SET ${updates.join(', ')} 
        WHERE id = $${valueIndex}
        RETURNING updated_at
      `;

      await client.query(query, values);

      // Log user update in audit log
      await client.query(`
        SELECT audit.create_audit_entry($1, $2, $3, $4, $5, $6)
      `, [
        'user',
        userId,
        'user',
        userId,
        'updated',
        JSON.stringify({
          fields_updated: Object.keys(updateData)
        })
      ]);

      await client.query('COMMIT');

      return await this.findUserById(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update user error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByRefreshToken(refreshToken) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT id, provider, provider_id, name, avatar, roles, permissions,
               encrypted_email, encrypted_metadata, created_at, updated_at, last_login
        FROM auth.users 
        WHERE refresh_token = $1
      `;
      
      const result = await client.query(query, [refreshToken]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      
      return {
        id: user.id,
        name: user.name,
        email: user.encrypted_email ? this.decrypt(user.encrypted_email) : null,
        avatar: user.avatar,
        provider: user.provider,
        providerId: user.provider_id,
        roles: user.roles,
        permissions: user.permissions,
        metadata: user.encrypted_metadata ? JSON.parse(this.decrypt(user.encrypted_metadata) || '{}') : {},
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login
      };
    } catch (error) {
      console.error('Find user by refresh token error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Role and permission management
  async getUserRoles(userId) {
    const client = await this.pool.connect();
    
    try {
      const query = `SELECT roles FROM auth.users WHERE id = $1`;
      const result = await client.query(query, [userId]);
      
      return result.rows[0]?.roles || [];
    } catch (error) {
      console.error('Get user roles error:', error);
      return [];
    } finally {
      client.release();
    }
  }

  async getUserPermissions(userId) {
    const client = await this.pool.connect();
    
    try {
      const query = `SELECT permissions FROM auth.users WHERE id = $1`;
      const result = await client.query(query, [userId]);
      
      return result.rows[0]?.permissions || [];
    } catch (error) {
      console.error('Get user permissions error:', error);
      return [];
    } finally {
      client.release();
    }
  }

  async addUserRole(userId, role) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE auth.users 
        SET roles = array_append(roles, $2), updated_at = NOW()
        WHERE id = $1 AND NOT ($2 = ANY(roles))
      `;
      
      await client.query(query, [userId, role]);

      // Log role addition
      await client.query(`
        SELECT audit.create_audit_entry($1, $2, $3, $4, $5, $6)
      `, [
        'user',
        userId,
        'role',
        role,
        'added',
        JSON.stringify({ user_id: userId, role: role })
      ]);
      
      return true;
    } catch (error) {
      console.error('Add user role error:', error);
      return false;
    } finally {
      client.release();
    }
  }

  async removeUserRole(userId, role) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE auth.users 
        SET roles = array_remove(roles, $2), updated_at = NOW()
        WHERE id = $1
      `;
      
      await client.query(query, [userId, role]);

      // Log role removal
      await client.query(`
        SELECT audit.create_audit_entry($1, $2, $3, $4, $5, $6)
      `, [
        'user',
        userId,
        'role',
        role,
        'removed',
        JSON.stringify({ user_id: userId, role: role })
      ]);
      
      return true;
    } catch (error) {
      console.error('Remove user role error:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // Database health check
  async healthCheck() {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query('SELECT NOW()');
      return {
        status: 'healthy',
        timestamp: result.rows[0].now,
        pool: {
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
    } finally {
      client.release();
    }
  }

  // Cleanup method
  async close() {
    await this.pool.end();
  }
}

module.exports = new DatabaseService();
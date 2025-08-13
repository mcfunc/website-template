-- Authentication schema for Stage 1
-- Secure user data storage with encryption

-- Create users table with encrypted sensitive data
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL, -- 'auth0', 'email', 'google', 'microsoft', 'github'
    provider_id VARCHAR(255), -- Provider-specific user ID
    name VARCHAR(255) NOT NULL,
    avatar TEXT, -- URL to user avatar image
    roles TEXT[] DEFAULT ARRAY['user'], -- User roles array
    permissions TEXT[] DEFAULT ARRAY['read:dashboard'], -- User permissions array
    
    -- Encrypted sensitive data
    encrypted_email JSONB, -- Encrypted email address
    encrypted_metadata JSONB, -- Encrypted user metadata (tokens, etc.)
    
    -- Authentication tokens
    refresh_token TEXT, -- For token refresh
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_provider ON auth.users(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_users_roles ON auth.users USING GIN(roles);
CREATE INDEX IF NOT EXISTS idx_users_permissions ON auth.users USING GIN(permissions);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON auth.users(refresh_token) WHERE refresh_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON auth.users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON auth.users(last_login);

-- Create user sessions table for session management
CREATE TABLE IF NOT EXISTS auth.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON auth.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth.user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON auth.user_sessions(expires_at);

-- Create roles and permissions tables for RBAC
CREATE TABLE IF NOT EXISTS auth.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default roles
INSERT INTO auth.roles (name, description, permissions) VALUES
    ('admin', 'System administrator with full access', ARRAY[
        'read:dashboard', 'write:dashboard', 'read:users', 'write:users', 
        'read:roles', 'write:roles', 'read:audit', 'read:analytics',
        'write:analytics', 'read:settings', 'write:settings'
    ]),
    ('user', 'Standard user with basic access', ARRAY[
        'read:dashboard', 'write:profile', 'read:analytics'
    ]),
    ('viewer', 'Read-only user', ARRAY[
        'read:dashboard', 'read:analytics'
    ])
ON CONFLICT (name) DO NOTHING;

-- Create permissions table
CREATE TABLE IF NOT EXISTS auth.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    resource VARCHAR(50) NOT NULL, -- 'dashboard', 'users', 'roles', etc.
    action VARCHAR(20) NOT NULL, -- 'read', 'write', 'delete', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default permissions
INSERT INTO auth.permissions (name, description, resource, action) VALUES
    ('read:dashboard', 'View dashboard and basic metrics', 'dashboard', 'read'),
    ('write:dashboard', 'Modify dashboard settings', 'dashboard', 'write'),
    ('read:users', 'View user information', 'users', 'read'),
    ('write:users', 'Create and modify users', 'users', 'write'),
    ('delete:users', 'Delete user accounts', 'users', 'delete'),
    ('read:roles', 'View roles and permissions', 'roles', 'read'),
    ('write:roles', 'Create and modify roles', 'roles', 'write'),
    ('read:audit', 'View audit logs', 'audit', 'read'),
    ('read:analytics', 'View analytics and reports', 'analytics', 'read'),
    ('write:analytics', 'Configure analytics settings', 'analytics', 'write'),
    ('read:settings', 'View application settings', 'settings', 'read'),
    ('write:settings', 'Modify application settings', 'settings', 'write'),
    ('write:profile', 'Edit own profile', 'profile', 'write')
ON CONFLICT (name) DO NOTHING;

-- Create function to check user permissions
CREATE OR REPLACE FUNCTION auth.user_has_permission(user_uuid UUID, permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_permissions TEXT[];
    user_roles TEXT[];
    role_permissions TEXT[];
    role_name TEXT;
BEGIN
    -- Get user's direct permissions
    SELECT permissions INTO user_permissions FROM auth.users WHERE id = user_uuid;
    
    -- Check direct permissions
    IF permission_name = ANY(user_permissions) THEN
        RETURN TRUE;
    END IF;
    
    -- Get user's roles
    SELECT roles INTO user_roles FROM auth.users WHERE id = user_uuid;
    
    -- Check role-based permissions
    FOREACH role_name IN ARRAY user_roles LOOP
        SELECT permissions INTO role_permissions FROM auth.roles WHERE name = role_name;
        IF permission_name = ANY(role_permissions) THEN
            RETURN TRUE;
        END IF;
    END LOOP;
    
    -- Admin role has all permissions
    IF 'admin' = ANY(user_roles) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check user roles
CREATE OR REPLACE FUNCTION auth.user_has_role(user_uuid UUID, role_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_roles TEXT[];
BEGIN
    SELECT roles INTO user_roles FROM auth.users WHERE id = user_uuid;
    RETURN role_name = ANY(user_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean expired sessions
CREATE OR REPLACE FUNCTION auth.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM auth.user_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to update user last_login
CREATE OR REPLACE FUNCTION auth.update_user_last_login()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_login = NOW();
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating last_login
CREATE TRIGGER tr_users_update_last_login
    BEFORE UPDATE OF refresh_token ON auth.users
    FOR EACH ROW
    WHEN (OLD.refresh_token IS DISTINCT FROM NEW.refresh_token AND NEW.refresh_token IS NOT NULL)
    EXECUTE FUNCTION auth.update_user_last_login();

-- Create view for user details (with decryption handled by application)
CREATE OR REPLACE VIEW auth.user_details AS
SELECT 
    u.id,
    u.provider,
    u.provider_id,
    u.name,
    u.avatar,
    u.roles,
    u.permissions,
    u.created_at,
    u.updated_at,
    u.last_login,
    COUNT(s.id) as active_sessions
FROM auth.users u
LEFT JOIN auth.user_sessions s ON u.id = s.user_id AND s.expires_at > NOW()
GROUP BY u.id, u.provider, u.provider_id, u.name, u.avatar, u.roles, u.permissions, u.created_at, u.updated_at, u.last_login;

-- Create function to get user stats
CREATE OR REPLACE FUNCTION auth.get_user_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_users', (SELECT COUNT(*) FROM auth.users),
        'active_sessions', (SELECT COUNT(*) FROM auth.user_sessions WHERE expires_at > NOW()),
        'users_by_provider', (
            SELECT json_object_agg(provider, user_count)
            FROM (
                SELECT provider, COUNT(*) as user_count
                FROM auth.users
                GROUP BY provider
            ) provider_stats
        ),
        'users_by_role', (
            SELECT json_object_agg(role_name, user_count)
            FROM (
                SELECT unnest(roles) as role_name, COUNT(*) as user_count
                FROM auth.users
                GROUP BY unnest(roles)
            ) role_stats
        ),
        'recent_logins', (
            SELECT COUNT(*)
            FROM auth.users
            WHERE last_login > NOW() - INTERVAL '24 hours'
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Initial audit entry for auth schema creation
SELECT audit.create_audit_entry(
    'system',
    NULL,
    'schema',
    'auth',
    'created',
    '{"stage": "1", "description": "Authentication schema created with encrypted user storage, RBAC, and session management"}'::jsonb
);

COMMENT ON SCHEMA auth IS 'Authentication and authorization schema with encrypted user data';
COMMENT ON TABLE auth.users IS 'User accounts with encrypted sensitive data (email, metadata)';
COMMENT ON TABLE auth.user_sessions IS 'Active user sessions for session management';
COMMENT ON TABLE auth.roles IS 'Role definitions with associated permissions';
COMMENT ON TABLE auth.permissions IS 'Permission definitions for fine-grained access control';
COMMENT ON FUNCTION auth.user_has_permission(UUID, TEXT) IS 'Check if user has specific permission';
COMMENT ON FUNCTION auth.user_has_role(UUID, TEXT) IS 'Check if user has specific role';
COMMENT ON FUNCTION auth.cleanup_expired_sessions() IS 'Clean up expired user sessions';
COMMENT ON VIEW auth.user_details IS 'User information with active session count';
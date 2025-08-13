-- Database initialization script
-- This script sets up the initial database structure for the site template

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;

-- Set default search path
ALTER DATABASE sitetemplate SET search_path TO app, auth, audit, public;

-- Create audit log table (Stage 1)
CREATE TABLE IF NOT EXISTS audit.audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    user_id UUID,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit.audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit.audit_log(event_type);

-- Function to automatically create audit entries
CREATE OR REPLACE FUNCTION audit.create_audit_entry(
    p_event_type VARCHAR(100),
    p_user_id UUID DEFAULT NULL,
    p_resource_type VARCHAR(100) DEFAULT NULL,
    p_resource_id VARCHAR(255) DEFAULT NULL,
    p_action VARCHAR(50) DEFAULT 'unknown',
    p_details JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO audit.audit_log (
        event_type, user_id, resource_type, resource_id, 
        action, details, ip_address, user_agent
    ) VALUES (
        p_event_type, p_user_id, p_resource_type, p_resource_id,
        p_action, p_details, p_ip_address, p_user_agent
    ) RETURNING id INTO audit_id;
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- Initial system audit entry
SELECT audit.create_audit_entry(
    'system',
    NULL,
    'database',
    'sitetemplate',
    'initialized',
    '{"stage": "0", "description": "Database initialized with basic structure"}'::jsonb
);

COMMENT ON SCHEMA auth IS 'Authentication and user management schema';
COMMENT ON SCHEMA app IS 'Main application schema';
COMMENT ON SCHEMA audit IS 'Audit logging and compliance schema';
COMMENT ON TABLE audit.audit_log IS 'Central audit log for all system events';
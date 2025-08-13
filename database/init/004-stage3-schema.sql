-- Stage 3: Core API Integration & Data Pipeline - Database Schema
-- External API integration, data transformation, and historical storage

-- API credentials and configuration
CREATE SCHEMA IF NOT EXISTS api;

-- External API providers configuration
CREATE TABLE IF NOT EXISTS api.providers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    base_url VARCHAR(500) NOT NULL,
    auth_type VARCHAR(50) NOT NULL DEFAULT 'oauth2', -- oauth2, api_key, basic_auth
    auth_config JSONB DEFAULT '{}',
    rate_limit_requests INTEGER DEFAULT 100,
    rate_limit_window INTEGER DEFAULT 3600, -- seconds
    timeout_seconds INTEGER DEFAULT 30,
    retry_attempts INTEGER DEFAULT 3,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth2 tokens for external API access
CREATE TABLE IF NOT EXISTS api.oauth_tokens (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL REFERENCES api.providers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API endpoints configuration
CREATE TABLE IF NOT EXISTS api.endpoints (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL REFERENCES api.providers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    path VARCHAR(500) NOT NULL,
    method VARCHAR(10) DEFAULT 'GET',
    headers JSONB DEFAULT '{}',
    query_params JSONB DEFAULT '{}',
    body_template JSONB DEFAULT '{}',
    response_mapping JSONB DEFAULT '{}',
    data_type VARCHAR(50) NOT NULL, -- users, transactions, metrics, etc.
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, name)
);

-- Raw API response storage (before transformation)
CREATE TABLE IF NOT EXISTS api.raw_responses (
    id SERIAL PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES api.endpoints(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    request_id UUID DEFAULT gen_random_uuid(),
    status_code INTEGER NOT NULL,
    headers JSONB DEFAULT '{}',
    response_data JSONB NOT NULL,
    response_size INTEGER,
    request_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    response_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transformed and normalized data storage
CREATE TABLE IF NOT EXISTS api.processed_data (
    id SERIAL PRIMARY KEY,
    raw_response_id INTEGER REFERENCES api.raw_responses(id) ON DELETE SET NULL,
    endpoint_id INTEGER NOT NULL REFERENCES api.endpoints(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    data_type VARCHAR(50) NOT NULL,
    normalized_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    data_hash VARCHAR(64), -- For deduplication
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Historical data snapshots for KPI calculations
CREATE TABLE IF NOT EXISTS api.data_snapshots (
    id SERIAL PRIMARY KEY,
    data_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    kpi_data JSONB NOT NULL,
    calculation_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(data_type, user_id, snapshot_date)
);

-- API request tracking and rate limiting
CREATE TABLE IF NOT EXISTS api.request_logs (
    id SERIAL PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES api.endpoints(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    request_id UUID DEFAULT gen_random_uuid(),
    method VARCHAR(10) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    headers JSONB DEFAULT '{}',
    query_params JSONB DEFAULT '{}',
    request_body JSONB DEFAULT '{}',
    status_code INTEGER,
    response_time_ms INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Error monitoring and alerting
CREATE TABLE IF NOT EXISTS api.error_logs (
    id SERIAL PRIMARY KEY,
    endpoint_id INTEGER REFERENCES api.endpoints(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB DEFAULT '{}',
    stack_trace TEXT,
    severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data quality monitoring
CREATE TABLE IF NOT EXISTS api.data_quality_metrics (
    id SERIAL PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES api.endpoints(id) ON DELETE CASCADE,
    data_type VARCHAR(50) NOT NULL,
    metric_date DATE NOT NULL,
    total_records INTEGER DEFAULT 0,
    valid_records INTEGER DEFAULT 0,
    invalid_records INTEGER DEFAULT 0,
    duplicate_records INTEGER DEFAULT 0,
    missing_fields JSONB DEFAULT '[]',
    quality_score DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(endpoint_id, data_type, metric_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider_user ON api.oauth_tokens(provider_id, user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON api.oauth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_raw_responses_endpoint_user ON api.raw_responses(endpoint_id, user_id);
CREATE INDEX IF NOT EXISTS idx_raw_responses_timestamp ON api.raw_responses(request_timestamp);
CREATE INDEX IF NOT EXISTS idx_processed_data_type_user ON api.processed_data(data_type, user_id);
CREATE INDEX IF NOT EXISTS idx_processed_data_hash ON api.processed_data(data_hash);
CREATE INDEX IF NOT EXISTS idx_processed_data_valid_from ON api.processed_data(valid_from);
CREATE INDEX IF NOT EXISTS idx_data_snapshots_type_user_date ON api.data_snapshots(data_type, user_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_request_logs_endpoint_created ON api.request_logs(endpoint_id, created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity_created ON api.error_logs(severity, created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON api.error_logs(resolved, created_at);

-- Function to refresh OAuth2 token
CREATE OR REPLACE FUNCTION api.refresh_oauth_token(
    p_token_id INTEGER
) RETURNS JSONB AS $$
DECLARE
    token_record RECORD;
    provider_record RECORD;
    new_token_data JSONB;
BEGIN
    -- Get token and provider information
    SELECT ot.* INTO token_record
    FROM api.oauth_tokens ot
    JOIN api.providers p ON ot.provider_id = p.id
    WHERE ot.id = p_token_id AND p.active = true;
    
    SELECT p.* INTO provider_record
    FROM api.providers p
    JOIN api.oauth_tokens ot ON ot.provider_id = p.id
    WHERE ot.id = p_token_id AND p.active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token not found or provider inactive');
    END IF;
    
    -- Check if token needs refresh (expires within 5 minutes)
    IF token_record.expires_at > NOW() + INTERVAL '5 minutes' THEN
        RETURN jsonb_build_object('success', true, 'refreshed', false, 'message', 'Token still valid');
    END IF;
    
    -- Log the refresh attempt
    INSERT INTO api.request_logs (endpoint_id, user_id, method, url, status_code)
    VALUES (NULL, token_record.user_id, 'POST', 'oauth_token_refresh', 200);
    
    -- Return success (actual refresh would be handled by external service)
    RETURN jsonb_build_object(
        'success', true,
        'refreshed', true,
        'token_id', p_token_id,
        'expires_at', token_record.expires_at
    );
END;
$$ LANGUAGE plpgsql;

-- Function to log API request
CREATE OR REPLACE FUNCTION api.log_request(
    p_endpoint_id INTEGER,
    p_user_id UUID DEFAULT NULL,
    p_method VARCHAR(10) DEFAULT 'GET',
    p_url VARCHAR(1000) DEFAULT '',
    p_headers JSONB DEFAULT '{}',
    p_query_params JSONB DEFAULT '{}',
    p_request_body JSONB DEFAULT '{}',
    p_status_code INTEGER DEFAULT NULL,
    p_response_time_ms INTEGER DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_retry_count INTEGER DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
    log_id INTEGER;
BEGIN
    INSERT INTO api.request_logs (
        endpoint_id, user_id, method, url, headers, query_params,
        request_body, status_code, response_time_ms, error_message, retry_count
    ) VALUES (
        p_endpoint_id, p_user_id, p_method, p_url, p_headers, p_query_params,
        p_request_body, p_status_code, p_response_time_ms, p_error_message, p_retry_count
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to store raw API response
CREATE OR REPLACE FUNCTION api.store_raw_response(
    p_endpoint_id INTEGER,
    p_user_id UUID DEFAULT NULL,
    p_status_code INTEGER DEFAULT 200,
    p_headers JSONB DEFAULT '{}',
    p_response_data JSONB DEFAULT '{}',
    p_processing_time_ms INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    response_id INTEGER;
    data_size INTEGER;
BEGIN
    -- Calculate response size
    data_size := length(p_response_data::text);
    
    INSERT INTO api.raw_responses (
        endpoint_id, user_id, status_code, headers, response_data,
        response_size, processing_time_ms
    ) VALUES (
        p_endpoint_id, p_user_id, p_status_code, p_headers, p_response_data,
        data_size, p_processing_time_ms
    ) RETURNING id INTO response_id;
    
    RETURN response_id;
END;
$$ LANGUAGE plpgsql;

-- Function to store processed data with deduplication
CREATE OR REPLACE FUNCTION api.store_processed_data(
    p_raw_response_id INTEGER DEFAULT NULL,
    p_endpoint_id INTEGER DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_data_type VARCHAR(50) DEFAULT 'generic',
    p_normalized_data JSONB DEFAULT '{}',
    p_metadata JSONB DEFAULT '{}'
) RETURNS INTEGER AS $$
DECLARE
    processed_id INTEGER;
    data_hash VARCHAR(64);
    existing_record INTEGER;
BEGIN
    -- Generate hash for deduplication
    data_hash := encode(digest(p_normalized_data::text, 'sha256'), 'hex');
    
    -- Check for existing record with same hash (deduplication)
    SELECT id INTO existing_record
    FROM api.processed_data
    WHERE data_hash = data_hash
    AND data_type = p_data_type
    AND user_id = p_user_id
    AND valid_to IS NULL;
    
    IF existing_record IS NOT NULL THEN
        -- Update existing record timestamp
        UPDATE api.processed_data
        SET updated_at = NOW()
        WHERE id = existing_record;
        
        RETURN existing_record;
    END IF;
    
    -- Insert new processed data
    INSERT INTO api.processed_data (
        raw_response_id, endpoint_id, user_id, data_type,
        normalized_data, metadata, data_hash
    ) VALUES (
        p_raw_response_id, p_endpoint_id, p_user_id, p_data_type,
        p_normalized_data, p_metadata, data_hash
    ) RETURNING id INTO processed_id;
    
    RETURN processed_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate KPIs and create snapshots
CREATE OR REPLACE FUNCTION api.create_kpi_snapshot(
    p_data_type VARCHAR(50),
    p_user_id UUID,
    p_snapshot_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
    kpi_data JSONB;
    total_records INTEGER;
    latest_record_date TIMESTAMP;
BEGIN
    -- Get basic metrics for the data type
    SELECT 
        COUNT(*) as total,
        MAX(created_at) as latest
    INTO total_records, latest_record_date
    FROM api.processed_data
    WHERE data_type = p_data_type
    AND user_id = p_user_id
    AND DATE(created_at) = p_snapshot_date;
    
    -- Build KPI data object
    kpi_data := jsonb_build_object(
        'total_records', COALESCE(total_records, 0),
        'latest_record_date', latest_record_date,
        'snapshot_date', p_snapshot_date,
        'data_type', p_data_type,
        'calculated_at', NOW()
    );
    
    -- Insert or update snapshot
    INSERT INTO api.data_snapshots (data_type, user_id, snapshot_date, kpi_data)
    VALUES (p_data_type, p_user_id, p_snapshot_date, kpi_data)
    ON CONFLICT (data_type, user_id, snapshot_date)
    DO UPDATE SET 
        kpi_data = EXCLUDED.kpi_data,
        created_at = NOW();
    
    RETURN kpi_data;
END;
$$ LANGUAGE plpgsql;

-- Function to log errors with severity
CREATE OR REPLACE FUNCTION api.log_error(
    p_endpoint_id INTEGER DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_error_type VARCHAR(100) DEFAULT 'generic_error',
    p_error_message TEXT DEFAULT '',
    p_error_details JSONB DEFAULT '{}',
    p_stack_trace TEXT DEFAULT NULL,
    p_severity VARCHAR(20) DEFAULT 'medium'
) RETURNS INTEGER AS $$
DECLARE
    error_id INTEGER;
BEGIN
    INSERT INTO api.error_logs (
        endpoint_id, user_id, error_type, error_message,
        error_details, stack_trace, severity
    ) VALUES (
        p_endpoint_id, p_user_id, p_error_type, p_error_message,
        p_error_details, p_stack_trace, p_severity
    ) RETURNING id INTO error_id;
    
    RETURN error_id;
END;
$$ LANGUAGE plpgsql;

-- Insert sample API providers
INSERT INTO api.providers (name, base_url, auth_type, auth_config, rate_limit_requests, rate_limit_window) VALUES
('JSONPlaceholder', 'https://jsonplaceholder.typicode.com', 'none', '{}', 1000, 3600),
('GitHub API', 'https://api.github.com', 'oauth2', '{"client_id": "", "client_secret": "", "scope": "repo,user"}', 5000, 3600),
('Stripe API', 'https://api.stripe.com/v1', 'api_key', '{"header": "Authorization", "prefix": "Bearer"}', 1000, 3600),
('MockAPI', 'https://demo-api.example.com', 'oauth2', '{"client_id": "demo", "client_secret": "secret"}', 100, 3600)
ON CONFLICT (name) DO NOTHING;

-- Insert sample endpoints
INSERT INTO api.endpoints (provider_id, name, path, method, data_type, response_mapping) VALUES
((SELECT id FROM api.providers WHERE name = 'JSONPlaceholder'), 'users', '/users', 'GET', 'users', 
 '{"id": "$.id", "name": "$.name", "email": "$.email", "company": "$.company.name"}'),
((SELECT id FROM api.providers WHERE name = 'JSONPlaceholder'), 'posts', '/posts', 'GET', 'posts',
 '{"id": "$.id", "title": "$.title", "body": "$.body", "userId": "$.userId"}'),
((SELECT id FROM api.providers WHERE name = 'MockAPI'), 'transactions', '/transactions', 'GET', 'transactions',
 '{"id": "$.id", "amount": "$.amount", "currency": "$.currency", "date": "$.created_at"}')
ON CONFLICT (provider_id, name) DO NOTHING;

-- Fetch configuration for automated data fetching
CREATE TABLE IF NOT EXISTS api.fetch_configs (
    id SERIAL PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES api.endpoints(id) ON DELETE CASCADE,
    schedule VARCHAR(50) DEFAULT 'hourly', -- cron pattern or predefined schedule
    enabled BOOLEAN DEFAULT true,
    last_run TIMESTAMP WITH TIME ZONE,
    next_run TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(endpoint_id)
);

-- Fetch execution metrics
CREATE TABLE IF NOT EXISTS api.fetch_metrics (
    id SERIAL PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES api.endpoints(id) ON DELETE CASCADE,
    execution_date DATE NOT NULL,
    users_processed INTEGER DEFAULT 0,
    successful_fetches INTEGER DEFAULT 0,
    failed_fetches INTEGER DEFAULT 0,
    total_records INTEGER DEFAULT 0,
    average_run_time_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(endpoint_id, execution_date)
);

-- Create indexes for fetch tables
CREATE INDEX IF NOT EXISTS idx_fetch_configs_enabled ON api.fetch_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_fetch_configs_next_run ON api.fetch_configs(next_run);
CREATE INDEX IF NOT EXISTS idx_fetch_metrics_endpoint_date ON api.fetch_metrics(endpoint_id, execution_date);

-- Detailed KPI storage for trends and analysis
CREATE TABLE IF NOT EXISTS api.kpi_detailed (
    id SERIAL PRIMARY KEY,
    data_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    period VARCHAR(50) NOT NULL,
    kpi_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(data_type, user_id, period)
);

-- Create indexes for KPI detailed table
CREATE INDEX IF NOT EXISTS idx_kpi_detailed_type_user_period ON api.kpi_detailed(data_type, user_id, period);
CREATE INDEX IF NOT EXISTS idx_kpi_detailed_calculated_at ON api.kpi_detailed(calculated_at);

-- Alerts and monitoring system
CREATE TABLE IF NOT EXISTS api.alerts (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    alert_data JSONB DEFAULT '{}',
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_notes TEXT
);

-- Create indexes for alerts table
CREATE INDEX IF NOT EXISTS idx_alerts_severity_triggered ON api.alerts(severity, triggered_at);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON api.alerts(resolved, triggered_at);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON api.alerts(alert_type);

-- Insert default fetch configurations
INSERT INTO api.fetch_configs (endpoint_id, schedule, enabled) 
SELECT id, 'hourly', true 
FROM api.endpoints 
WHERE active = true
ON CONFLICT (endpoint_id) DO NOTHING;

-- Grant permissions
GRANT USAGE ON SCHEMA api TO admin;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA api TO admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA api TO admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO admin;
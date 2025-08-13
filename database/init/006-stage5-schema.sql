-- Stage 5: Admin & Analytics Foundation Schema
-- Admin dashboard, A/B testing, user metrics, and monitoring

-- Create analytics schema
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS admin;

-- User analytics and metrics
CREATE TABLE analytics.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    country VARCHAR(2),
    city VARCHAR(100),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    page_views INTEGER DEFAULT 0,
    actions_count INTEGER DEFAULT 0,
    is_bounce BOOLEAN DEFAULT false,
    referrer TEXT,
    landing_page TEXT,
    exit_page TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Page views and navigation tracking
CREATE TABLE analytics.page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES analytics.user_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    title TEXT,
    referrer TEXT,
    load_time_ms INTEGER,
    time_on_page_seconds INTEGER,
    scroll_depth_percent INTEGER,
    viewport_width INTEGER,
    viewport_height INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User actions and events tracking
CREATE TABLE analytics.user_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES analytics.user_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    label VARCHAR(200),
    value DECIMAL(10,2),
    properties JSONB,
    page_path TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- A/B Testing Framework
CREATE TABLE admin.ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    hypothesis TEXT,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
    test_type VARCHAR(50) DEFAULT 'split' CHECK (test_type IN ('split', 'multivariate', 'redirect')),
    traffic_allocation DECIMAL(5,2) DEFAULT 100.00 CHECK (traffic_allocation >= 0 AND traffic_allocation <= 100),
    target_audience JSONB, -- Targeting rules
    success_metrics JSONB NOT NULL, -- Primary and secondary metrics
    statistical_significance DECIMAL(5,2) DEFAULT 95.0,
    minimum_sample_size INTEGER DEFAULT 1000,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- A/B Test Variants
CREATE TABLE admin.ab_test_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES admin.ab_tests(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_control BOOLEAN DEFAULT false,
    traffic_weight DECIMAL(5,2) NOT NULL CHECK (traffic_weight >= 0 AND traffic_weight <= 100),
    configuration JSONB, -- Variant-specific config
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(test_id, name)
);

-- A/B Test Assignments
CREATE TABLE admin.ab_test_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES admin.ab_tests(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES admin.ab_test_variants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id VARCHAR(255), -- For anonymous users
    assignment_method VARCHAR(50) DEFAULT 'random', -- random, sticky, manual
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(test_id, user_id),
    UNIQUE(test_id, session_id)
);

-- A/B Test Results
CREATE TABLE admin.ab_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES admin.ab_tests(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES admin.ab_test_variants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    metric_name VARCHAR(200) NOT NULL,
    metric_value DECIMAL(15,4),
    metric_type VARCHAR(50) DEFAULT 'conversion' CHECK (metric_type IN ('conversion', 'revenue', 'engagement', 'retention')),
    event_data JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System Performance Metrics
CREATE TABLE analytics.system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(200) NOT NULL,
    metric_type VARCHAR(100) NOT NULL, -- cpu, memory, disk, network, response_time, etc.
    service_name VARCHAR(100),
    instance_id VARCHAR(200),
    value DECIMAL(15,4) NOT NULL,
    unit VARCHAR(20), -- %, ms, bytes, count, etc.
    tags JSONB, -- Additional metadata
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Management (Admin Functions)
CREATE TABLE admin.user_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES auth.users(id),
    target_user_id UUID REFERENCES auth.users(id),
    action_type VARCHAR(100) NOT NULL, -- activate, deactivate, delete, reset_password, etc.
    reason TEXT,
    details JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dashboard Configuration
CREATE TABLE admin.dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    widget_type VARCHAR(100) NOT NULL, -- chart, metric, table, etc.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    configuration JSONB NOT NULL, -- Widget-specific config
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    width INTEGER DEFAULT 4,
    height INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_user_sessions_user_id_started ON analytics.user_sessions(user_id, started_at DESC);
CREATE INDEX idx_user_sessions_session_id ON analytics.user_sessions(session_id);
CREATE INDEX idx_user_sessions_started_at ON analytics.user_sessions(started_at DESC);

CREATE INDEX idx_page_views_session_id ON analytics.page_views(session_id);
CREATE INDEX idx_page_views_user_id_timestamp ON analytics.page_views(user_id, timestamp DESC);
CREATE INDEX idx_page_views_path_timestamp ON analytics.page_views(path, timestamp DESC);

CREATE INDEX idx_user_events_session_id ON analytics.user_events(session_id);
CREATE INDEX idx_user_events_user_id_timestamp ON analytics.user_events(user_id, timestamp DESC);
CREATE INDEX idx_user_events_event_type_timestamp ON analytics.user_events(event_type, timestamp DESC);

CREATE INDEX idx_ab_tests_status ON admin.ab_tests(status);
CREATE INDEX idx_ab_tests_start_end_date ON admin.ab_tests(start_date, end_date);

CREATE INDEX idx_ab_test_assignments_test_user ON admin.ab_test_assignments(test_id, user_id);
CREATE INDEX idx_ab_test_assignments_test_session ON admin.ab_test_assignments(test_id, session_id);

CREATE INDEX idx_ab_test_results_test_variant ON admin.ab_test_results(test_id, variant_id);
CREATE INDEX idx_ab_test_results_recorded_at ON admin.ab_test_results(recorded_at DESC);

CREATE INDEX idx_system_metrics_name_timestamp ON analytics.system_metrics(metric_name, timestamp DESC);
CREATE INDEX idx_system_metrics_service_timestamp ON analytics.system_metrics(service_name, timestamp DESC);

CREATE INDEX idx_user_actions_admin_timestamp ON admin.user_actions(admin_user_id, timestamp DESC);
CREATE INDEX idx_user_actions_target_timestamp ON admin.user_actions(target_user_id, timestamp DESC);

-- Analytics Functions
CREATE OR REPLACE FUNCTION analytics.get_user_metrics(
    p_user_id UUID DEFAULT NULL,
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}';
    session_stats RECORD;
    page_stats RECORD;
    event_stats RECORD;
BEGIN
    -- Session statistics
    SELECT 
        COUNT(*) as total_sessions,
        AVG(duration_seconds) as avg_session_duration,
        AVG(page_views) as avg_page_views,
        COUNT(CASE WHEN is_bounce THEN 1 END) as bounce_sessions,
        COUNT(DISTINCT DATE(started_at)) as active_days
    INTO session_stats
    FROM analytics.user_sessions
    WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND started_at BETWEEN p_start_date AND p_end_date;
    
    -- Page view statistics
    SELECT 
        COUNT(*) as total_page_views,
        COUNT(DISTINCT path) as unique_pages,
        AVG(time_on_page_seconds) as avg_time_on_page,
        AVG(scroll_depth_percent) as avg_scroll_depth
    INTO page_stats
    FROM analytics.page_views
    WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND timestamp BETWEEN p_start_date AND p_end_date;
    
    -- Event statistics
    SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT event_type) as unique_event_types,
        COUNT(DISTINCT event_name) as unique_events
    INTO event_stats
    FROM analytics.user_events
    WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND timestamp BETWEEN p_start_date AND p_end_date;
    
    result := jsonb_build_object(
        'sessions', jsonb_build_object(
            'total', COALESCE(session_stats.total_sessions, 0),
            'avg_duration_seconds', COALESCE(session_stats.avg_session_duration, 0),
            'avg_page_views', COALESCE(session_stats.avg_page_views, 0),
            'bounce_rate', CASE 
                WHEN session_stats.total_sessions > 0 
                THEN (session_stats.bounce_sessions::DECIMAL / session_stats.total_sessions * 100)::DECIMAL(5,2)
                ELSE 0 
            END,
            'active_days', COALESCE(session_stats.active_days, 0)
        ),
        'page_views', jsonb_build_object(
            'total', COALESCE(page_stats.total_page_views, 0),
            'unique_pages', COALESCE(page_stats.unique_pages, 0),
            'avg_time_on_page', COALESCE(page_stats.avg_time_on_page, 0),
            'avg_scroll_depth', COALESCE(page_stats.avg_scroll_depth, 0)
        ),
        'events', jsonb_build_object(
            'total', COALESCE(event_stats.total_events, 0),
            'unique_types', COALESCE(event_stats.unique_event_types, 0),
            'unique_events', COALESCE(event_stats.unique_events, 0)
        ),
        'date_range', jsonb_build_object(
            'start', p_start_date,
            'end', p_end_date
        )
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- A/B Testing Functions
CREATE OR REPLACE FUNCTION admin.assign_ab_test_variant(
    p_test_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_session_id VARCHAR(255) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    test_record RECORD;
    variant_record RECORD;
    assignment_record RECORD;
    random_weight DECIMAL(5,2);
    cumulative_weight DECIMAL(5,2) := 0;
    selected_variant_id UUID;
BEGIN
    -- Check if test is active
    SELECT * INTO test_record
    FROM admin.ab_tests
    WHERE id = p_test_id AND status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Test not found or not active';
    END IF;
    
    -- Check for existing assignment
    SELECT variant_id INTO selected_variant_id
    FROM admin.ab_test_assignments
    WHERE test_id = p_test_id 
    AND (
        (p_user_id IS NOT NULL AND user_id = p_user_id) OR
        (p_session_id IS NOT NULL AND session_id = p_session_id)
    );
    
    IF FOUND THEN
        RETURN selected_variant_id;
    END IF;
    
    -- Generate random weight for assignment
    random_weight := random() * 100;
    
    -- Find variant based on traffic weight
    FOR variant_record IN
        SELECT id, traffic_weight
        FROM admin.ab_test_variants
        WHERE test_id = p_test_id
        ORDER BY created_at
    LOOP
        cumulative_weight := cumulative_weight + variant_record.traffic_weight;
        IF random_weight <= cumulative_weight THEN
            selected_variant_id := variant_record.id;
            EXIT;
        END IF;
    END LOOP;
    
    -- Create assignment record
    INSERT INTO admin.ab_test_assignments (
        test_id, variant_id, user_id, session_id
    ) VALUES (
        p_test_id, selected_variant_id, p_user_id, p_session_id
    );
    
    RETURN selected_variant_id;
END;
$$ LANGUAGE plpgsql;

-- System Health Check Function
CREATE OR REPLACE FUNCTION analytics.record_system_metric(
    p_metric_name VARCHAR(200),
    p_metric_type VARCHAR(100),
    p_value DECIMAL(15,4),
    p_service_name VARCHAR(100) DEFAULT NULL,
    p_instance_id VARCHAR(200) DEFAULT NULL,
    p_unit VARCHAR(20) DEFAULT NULL,
    p_tags JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    metric_id UUID;
BEGIN
    INSERT INTO analytics.system_metrics (
        metric_name, metric_type, service_name, instance_id,
        value, unit, tags
    ) VALUES (
        p_metric_name, p_metric_type, p_service_name, p_instance_id,
        p_value, p_unit, p_tags
    ) RETURNING id INTO metric_id;
    
    RETURN metric_id;
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for development
INSERT INTO admin.ab_tests (name, display_name, description, status, success_metrics) VALUES
('landing_page_cta', 'Landing Page CTA Test', 'Test different call-to-action buttons on landing page', 'active', 
 '{"primary": "click_through_rate", "secondary": ["conversion_rate", "engagement_time"]}'),
('dashboard_layout', 'Dashboard Layout Optimization', 'Compare different dashboard layouts for user engagement', 'draft',
 '{"primary": "time_on_page", "secondary": ["bounce_rate", "feature_usage"]}'),
('pricing_display', 'Pricing Display Test', 'Test different pricing page layouts', 'active',
 '{"primary": "conversion_rate", "secondary": ["scroll_depth", "cta_clicks"]}');

INSERT INTO admin.ab_test_variants (test_id, name, display_name, is_control, traffic_weight, configuration) 
SELECT 
    t.id,
    v.name,
    v.display_name,
    v.is_control,
    v.traffic_weight,
    v.configuration::jsonb
FROM admin.ab_tests t,
(VALUES 
    ('landing_page_cta', 'control', 'Original CTA', true, 50.0, '{"button_text": "Get Started", "button_color": "#007bff"}'),
    ('landing_page_cta', 'variant_a', 'Green CTA', false, 25.0, '{"button_text": "Start Free Trial", "button_color": "#28a745"}'),
    ('landing_page_cta', 'variant_b', 'Orange CTA', false, 25.0, '{"button_text": "Try It Now", "button_color": "#fd7e14"}'),
    
    ('dashboard_layout', 'control', 'Current Layout', true, 50.0, '{"layout": "sidebar", "widget_size": "medium"}'),
    ('dashboard_layout', 'variant_a', 'Top Navigation', false, 50.0, '{"layout": "top_nav", "widget_size": "large"}'),
    
    ('pricing_display', 'control', 'Standard Pricing', true, 33.33, '{"layout": "table", "highlight_popular": false}'),
    ('pricing_display', 'variant_a', 'Card Layout', false, 33.33, '{"layout": "cards", "highlight_popular": true}'),
    ('pricing_display', 'variant_b', 'Minimal Design', false, 33.34, '{"layout": "minimal", "highlight_popular": true}')
) AS v(test_name, name, display_name, is_control, traffic_weight, configuration)
WHERE t.name = v.test_name;

-- Create app_user role if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user;
    END IF;
END
$$;

-- Grant permissions
GRANT USAGE ON SCHEMA analytics TO app_user;
GRANT USAGE ON SCHEMA admin TO app_user;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA analytics TO app_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA admin TO app_user;

-- Add comments
COMMENT ON SCHEMA analytics IS 'User behavior analytics and system metrics';
COMMENT ON SCHEMA admin IS 'Admin functionality including A/B testing and user management';
COMMENT ON TABLE analytics.user_sessions IS 'User session tracking with device and location data';
COMMENT ON TABLE admin.ab_tests IS 'A/B test configurations and management';
COMMENT ON TABLE admin.ab_test_variants IS 'Test variants with traffic allocation and configuration';
COMMENT ON TABLE analytics.system_metrics IS 'System performance and health metrics for monitoring';
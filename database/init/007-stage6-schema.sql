-- Stage 6: Advanced User Experience Schema
-- Modular dashboard widgets, real-time streaming, and advanced analytics

-- Create dashboards schema for widget management
CREATE SCHEMA IF NOT EXISTS dashboards;

-- Create realtime schema for WebSocket and streaming data
CREATE SCHEMA IF NOT EXISTS realtime;

-- Dashboard widget definitions
CREATE TABLE dashboards.widget_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'analytics', 'charts', 'metrics', 'alerts'
    component_path VARCHAR(500) NOT NULL, -- Path to React component
    config_schema JSONB NOT NULL DEFAULT '{}', -- JSON schema for widget configuration
    default_config JSONB NOT NULL DEFAULT '{}',
    data_source VARCHAR(100), -- analytics, external_api, database, realtime
    refresh_interval INTEGER DEFAULT 30, -- seconds
    is_realtime BOOLEAN DEFAULT false,
    requires_permissions TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User dashboard configurations
CREATE TABLE dashboards.user_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    layout_config JSONB NOT NULL DEFAULT '{"columns": 12, "rows": []}'::jsonb,
    is_default BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Dashboard widget instances
CREATE TABLE dashboards.dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards.user_dashboards(id) ON DELETE CASCADE,
    widget_type_id UUID NOT NULL REFERENCES dashboards.widget_types(id),
    position_x INTEGER NOT NULL DEFAULT 0,
    position_y INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 4,
    height INTEGER NOT NULL DEFAULT 3,
    config JSONB NOT NULL DEFAULT '{}',
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time data streams
CREATE TABLE realtime.data_streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    stream_type VARCHAR(50) NOT NULL, -- 'metrics', 'events', 'alerts', 'logs'
    data_source VARCHAR(100) NOT NULL, -- Source system or service
    topic VARCHAR(200) NOT NULL, -- Redis pub/sub topic or WebSocket channel
    schema_definition JSONB NOT NULL DEFAULT '{}',
    retention_hours INTEGER DEFAULT 24,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time alert definitions
CREATE TABLE realtime.alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    data_stream_id UUID NOT NULL REFERENCES realtime.data_streams(id),
    condition_expression TEXT NOT NULL, -- JSON or SQL-like expression
    threshold_value DECIMAL,
    comparison_operator VARCHAR(10), -- '>', '<', '>=', '<=', '==', '!='
    severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    notification_channels TEXT[] DEFAULT '{}', -- 'email', 'slack', 'webhook', 'dashboard'
    is_enabled BOOLEAN DEFAULT true,
    cooldown_minutes INTEGER DEFAULT 5, -- Prevent alert spam
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alert history and notifications
CREATE TABLE realtime.alert_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_rule_id UUID NOT NULL REFERENCES realtime.alert_rules(id),
    triggered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    trigger_data JSONB, -- The data that triggered the alert
    notification_channels TEXT[] DEFAULT '{}',
    acknowledgment_status VARCHAR(20) DEFAULT 'unacknowledged', -- 'unacknowledged', 'acknowledged', 'resolved'
    acknowledged_by UUID,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- WebSocket session management
CREATE TABLE realtime.websocket_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100) UNIQUE NOT NULL,
    user_id UUID,
    connection_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    subscriptions TEXT[] DEFAULT '{}', -- List of subscribed channels/topics
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true
);

-- Advanced analytics data marts
CREATE TABLE analytics.data_marts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    mart_type VARCHAR(50) NOT NULL, -- 'user_behavior', 'business_metrics', 'system_performance'
    source_tables TEXT[] NOT NULL,
    aggregation_rules JSONB NOT NULL,
    refresh_schedule VARCHAR(100), -- Cron expression
    last_refresh TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Micro-frontend module registry
CREATE TABLE dashboards.microfrontend_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    description TEXT,
    module_url VARCHAR(500) NOT NULL, -- URL to load the module
    entry_point VARCHAR(200) NOT NULL, -- JavaScript entry point
    dependencies JSONB DEFAULT '[]',
    permissions_required TEXT[] DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_dashboard_widgets_dashboard_id ON dashboards.dashboard_widgets(dashboard_id);
CREATE INDEX idx_dashboard_widgets_widget_type ON dashboards.dashboard_widgets(widget_type_id);
CREATE INDEX idx_user_dashboards_user_id ON dashboards.user_dashboards(user_id);
CREATE INDEX idx_user_dashboards_default ON dashboards.user_dashboards(user_id, is_default) WHERE is_default = true;

CREATE INDEX idx_alert_notifications_rule_id ON realtime.alert_notifications(alert_rule_id);
CREATE INDEX idx_alert_notifications_triggered ON realtime.alert_notifications(triggered_at);
CREATE INDEX idx_alert_notifications_unresolved ON realtime.alert_notifications(alert_rule_id, resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX idx_websocket_sessions_user_id ON realtime.websocket_sessions(user_id);
CREATE INDEX idx_websocket_sessions_active ON realtime.websocket_sessions(is_active) WHERE is_active = true;

CREATE INDEX idx_data_streams_active ON realtime.data_streams(is_active) WHERE is_active = true;
CREATE INDEX idx_data_streams_type ON realtime.data_streams(stream_type);

-- Functions for real-time data processing
CREATE OR REPLACE FUNCTION realtime.process_stream_data(
    p_stream_name VARCHAR,
    p_data JSONB,
    p_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS UUID AS $$
DECLARE
    v_stream_id UUID;
    v_alert_rules RECORD;
    v_alert_triggered BOOLEAN := false;
    v_notification_id UUID;
BEGIN
    -- Get stream ID
    SELECT id INTO v_stream_id 
    FROM realtime.data_streams 
    WHERE name = p_stream_name AND is_active = true;
    
    IF v_stream_id IS NULL THEN
        RAISE EXCEPTION 'Stream % not found or inactive', p_stream_name;
    END IF;
    
    -- Check alert rules for this stream
    FOR v_alert_rules IN 
        SELECT * FROM realtime.alert_rules ar
        WHERE ar.data_stream_id = v_stream_id 
        AND ar.is_enabled = true
    LOOP
        -- Simple threshold-based alerting (can be extended)
        IF v_alert_rules.threshold_value IS NOT NULL THEN
            -- Extract numeric value from data based on condition_expression
            -- This is simplified - in production, you'd want more sophisticated expression parsing
            CASE v_alert_rules.comparison_operator
                WHEN '>' THEN
                    v_alert_triggered := (p_data->>v_alert_rules.condition_expression)::DECIMAL > v_alert_rules.threshold_value;
                WHEN '<' THEN
                    v_alert_triggered := (p_data->>v_alert_rules.condition_expression)::DECIMAL < v_alert_rules.threshold_value;
                WHEN '>=' THEN
                    v_alert_triggered := (p_data->>v_alert_rules.condition_expression)::DECIMAL >= v_alert_rules.threshold_value;
                WHEN '<=' THEN
                    v_alert_triggered := (p_data->>v_alert_rules.condition_expression)::DECIMAL <= v_alert_rules.threshold_value;
                ELSE
                    v_alert_triggered := false;
            END CASE;
            
            -- Create alert notification if triggered
            IF v_alert_triggered THEN
                INSERT INTO realtime.alert_notifications (
                    alert_rule_id, triggered_at, severity, message, trigger_data, notification_channels
                ) VALUES (
                    v_alert_rules.id,
                    p_timestamp,
                    v_alert_rules.severity,
                    format('Alert: %s threshold exceeded', v_alert_rules.display_name),
                    p_data,
                    v_alert_rules.notification_channels
                ) RETURNING id INTO v_notification_id;
            END IF;
        END IF;
    END LOOP;
    
    RETURN v_stream_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get user dashboard configuration
CREATE OR REPLACE FUNCTION dashboards.get_user_dashboard_config(
    p_user_id UUID,
    p_dashboard_name VARCHAR DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB := '{}';
    v_dashboard RECORD;
    v_widgets JSONB := '[]';
BEGIN
    -- Get dashboard (default if name not specified)
    IF p_dashboard_name IS NULL THEN
        SELECT * INTO v_dashboard 
        FROM dashboards.user_dashboards 
        WHERE user_id = p_user_id AND is_default = true 
        LIMIT 1;
    ELSE
        SELECT * INTO v_dashboard 
        FROM dashboards.user_dashboards 
        WHERE user_id = p_user_id AND name = p_dashboard_name;
    END IF;
    
    -- If no dashboard found, return empty config
    IF v_dashboard IS NULL THEN
        RETURN '{"widgets": [], "layout": {"columns": 12, "rows": []}}'::jsonb;
    END IF;
    
    -- Get widgets for this dashboard
    SELECT json_agg(
        json_build_object(
            'id', dw.id,
            'widget_type', wt.name,
            'display_name', wt.display_name,
            'component_path', wt.component_path,
            'position', json_build_object(
                'x', dw.position_x,
                'y', dw.position_y,
                'width', dw.width,
                'height', dw.height
            ),
            'config', dw.config,
            'data_source', wt.data_source,
            'refresh_interval', wt.refresh_interval,
            'is_realtime', wt.is_realtime
        )
    ) INTO v_widgets
    FROM dashboards.dashboard_widgets dw
    JOIN dashboards.widget_types wt ON dw.widget_type_id = wt.id
    WHERE dw.dashboard_id = v_dashboard.id AND dw.is_visible = true;
    
    -- Build result
    v_result := json_build_object(
        'dashboard_id', v_dashboard.id,
        'name', v_dashboard.name,
        'layout', v_dashboard.layout_config,
        'widgets', COALESCE(v_widgets, '[]'::json)
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Insert default widget types
INSERT INTO dashboards.widget_types (
    name, display_name, description, category, component_path, 
    config_schema, default_config, data_source, refresh_interval, is_realtime
) VALUES
-- Analytics widgets
('user_activity_chart', 'User Activity Chart', 'Real-time user activity visualization', 'analytics', 
 'widgets/UserActivityChart', '{"time_range": "string", "chart_type": "string"}', 
 '{"time_range": "1h", "chart_type": "line"}', 'analytics', 30, true),

('conversion_funnel', 'Conversion Funnel', 'User conversion funnel analysis', 'analytics',
 'widgets/ConversionFunnel', '{"funnel_steps": "array", "time_range": "string"}',
 '{"funnel_steps": ["visit", "signup", "purchase"], "time_range": "24h"}', 'analytics', 300, false),

('real_time_metrics', 'Real-time Metrics', 'Live system and user metrics', 'metrics',
 'widgets/RealTimeMetrics', '{"metrics": "array", "display_format": "string"}',
 '{"metrics": ["active_users", "page_views", "errors"], "display_format": "cards"}', 'realtime', 5, true),

-- Chart widgets
('line_chart', 'Line Chart', 'Configurable line chart widget', 'charts',
 'widgets/LineChart', '{"data_source": "string", "x_axis": "string", "y_axis": "string"}',
 '{"data_source": "analytics", "x_axis": "time", "y_axis": "value"}', 'analytics', 60, false),

('bar_chart', 'Bar Chart', 'Configurable bar chart widget', 'charts',
 'widgets/BarChart', '{"data_source": "string", "group_by": "string", "aggregate": "string"}',
 '{"data_source": "analytics", "group_by": "page", "aggregate": "count"}', 'analytics', 60, false),

('pie_chart', 'Pie Chart', 'Data distribution pie chart', 'charts',
 'widgets/PieChart', '{"data_source": "string", "value_field": "string", "label_field": "string"}',
 '{"data_source": "analytics", "value_field": "count", "label_field": "category"}', 'analytics', 120, false),

-- Alert widgets
('alert_list', 'Alert List', 'Recent alerts and notifications', 'alerts',
 'widgets/AlertList', '{"severity_filter": "array", "limit": "number"}',
 '{"severity_filter": ["high", "critical"], "limit": 10}', 'realtime', 15, true),

('system_health', 'System Health', 'Overall system health indicators', 'metrics',
 'widgets/SystemHealth', '{"services": "array", "include_details": "boolean"}',
 '{"services": ["database", "redis", "api"], "include_details": true}', 'realtime', 30, true);

-- Insert default data streams
INSERT INTO realtime.data_streams (
    name, display_name, description, stream_type, data_source, topic, schema_definition
) VALUES
('user_activity', 'User Activity Stream', 'Real-time user activity events', 'events', 'analytics', 'stream:user_activity',
 '{"type": "object", "properties": {"user_id": {"type": "string"}, "action": {"type": "string"}, "timestamp": {"type": "string"}}}'),

('system_metrics', 'System Metrics Stream', 'Real-time system performance metrics', 'metrics', 'monitoring', 'stream:system_metrics',
 '{"type": "object", "properties": {"metric_name": {"type": "string"}, "value": {"type": "number"}, "timestamp": {"type": "string"}}}'),

('error_events', 'Error Events Stream', 'Application error and exception events', 'events', 'logging', 'stream:errors',
 '{"type": "object", "properties": {"level": {"type": "string"}, "message": {"type": "string"}, "stack": {"type": "string"}}}'),

('business_events', 'Business Events Stream', 'Key business events and conversions', 'events', 'analytics', 'stream:business_events',
 '{"type": "object", "properties": {"event_type": {"type": "string"}, "value": {"type": "number"}, "metadata": {"type": "object"}}}');

-- Insert sample alert rules
INSERT INTO realtime.alert_rules (
    name, display_name, description, data_stream_id, condition_expression, 
    threshold_value, comparison_operator, severity, notification_channels
) VALUES
('high_error_rate', 'High Error Rate', 'Alert when error rate exceeds threshold', 
 (SELECT id FROM realtime.data_streams WHERE name = 'error_events'),
 'error_count', 10, '>', 'high', ARRAY['dashboard', 'email']),

('low_active_users', 'Low Active Users', 'Alert when active user count drops below threshold',
 (SELECT id FROM realtime.data_streams WHERE name = 'user_activity'),
 'active_users', 5, '<', 'medium', ARRAY['dashboard']),

('system_cpu_high', 'High CPU Usage', 'Alert when CPU usage exceeds 80%',
 (SELECT id FROM realtime.data_streams WHERE name = 'system_metrics'),
 'cpu_usage', 80, '>', 'high', ARRAY['dashboard', 'email']);

-- Create app_user role if it doesn't exist and grant permissions
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user;
    END IF;
END
$$;

-- Grant permissions
GRANT USAGE ON SCHEMA dashboards TO app_user;
GRANT USAGE ON SCHEMA realtime TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dashboards TO app_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA realtime TO app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO app_user;

-- Add comments
COMMENT ON SCHEMA dashboards IS 'Modular dashboard and widget management system';
COMMENT ON SCHEMA realtime IS 'Real-time data streaming, alerts, and WebSocket management';
COMMENT ON TABLE dashboards.widget_types IS 'Available widget types for dashboard composition';
COMMENT ON TABLE dashboards.user_dashboards IS 'User-customized dashboard configurations';
COMMENT ON TABLE realtime.data_streams IS 'Real-time data stream definitions';
COMMENT ON TABLE realtime.alert_rules IS 'Real-time alerting rules and conditions';
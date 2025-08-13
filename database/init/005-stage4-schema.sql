-- Stage 4: Theming & Modular System - Database Schema
-- Centralized theming, plugin architecture, feature toggles, and dynamic configurations

-- Theme and branding system
CREATE SCHEMA IF NOT EXISTS theming;

-- Brand profiles for multi-tenant theming
CREATE TABLE IF NOT EXISTS theming.brand_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    logo_url VARCHAR(500),
    favicon_url VARCHAR(500),
    primary_color VARCHAR(7) NOT NULL DEFAULT '#007bff', -- Hex color
    secondary_color VARCHAR(7) NOT NULL DEFAULT '#6c757d',
    accent_color VARCHAR(7) NOT NULL DEFAULT '#28a745',
    background_color VARCHAR(7) NOT NULL DEFAULT '#ffffff',
    text_color VARCHAR(7) NOT NULL DEFAULT '#212529',
    font_family VARCHAR(100) DEFAULT 'Inter, system-ui, sans-serif',
    custom_css TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Theme configurations
CREATE TABLE IF NOT EXISTS theming.themes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    theme_type VARCHAR(50) DEFAULT 'light', -- light, dark, auto, custom
    css_variables JSONB NOT NULL DEFAULT '{}',
    component_overrides JSONB DEFAULT '{}',
    layout_config JSONB DEFAULT '{}',
    brand_profile_id INTEGER REFERENCES theming.brand_profiles(id) ON DELETE SET NULL,
    active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, brand_profile_id)
);

-- User theme preferences
CREATE TABLE IF NOT EXISTS theming.user_theme_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    theme_id INTEGER REFERENCES theming.themes(id) ON DELETE SET NULL,
    brand_profile_id INTEGER REFERENCES theming.brand_profiles(id) ON DELETE SET NULL,
    custom_overrides JSONB DEFAULT '{}',
    auto_switch BOOLEAN DEFAULT true, -- Auto switch based on system preference
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Plugin system schema
CREATE SCHEMA IF NOT EXISTS plugins;

-- Plugin registry
CREATE TABLE IF NOT EXISTS plugins.registry (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    version VARCHAR(20) NOT NULL,
    author VARCHAR(100),
    plugin_type VARCHAR(50) NOT NULL, -- component, service, middleware, widget
    entry_point VARCHAR(200) NOT NULL, -- JS module path or function name
    dependencies JSONB DEFAULT '[]',
    config_schema JSONB DEFAULT '{}',
    permissions JSONB DEFAULT '[]',
    enabled BOOLEAN DEFAULT false,
    installed BOOLEAN DEFAULT false,
    install_path VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Plugin configurations per user/tenant
CREATE TABLE IF NOT EXISTS plugins.configurations (
    id SERIAL PRIMARY KEY,
    plugin_id INTEGER NOT NULL REFERENCES plugins.registry(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    brand_profile_id INTEGER REFERENCES theming.brand_profiles(id) ON DELETE SET NULL,
    config_data JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(plugin_id, user_id, brand_profile_id)
);

-- Feature flags system
CREATE TABLE IF NOT EXISTS plugins.feature_flags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    flag_type VARCHAR(50) DEFAULT 'boolean', -- boolean, string, number, json
    default_value JSONB NOT NULL,
    current_value JSONB NOT NULL,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    target_groups JSONB DEFAULT '[]', -- User groups or conditions
    environment VARCHAR(50) DEFAULT 'development',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User-specific feature flag overrides
CREATE TABLE IF NOT EXISTS plugins.user_feature_flags (
    id SERIAL PRIMARY KEY,
    feature_flag_id INTEGER NOT NULL REFERENCES plugins.feature_flags(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    override_value JSONB NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(feature_flag_id, user_id)
);

-- Dynamic navigation and menu system
CREATE TABLE IF NOT EXISTS theming.navigation_menus (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    menu_type VARCHAR(50) DEFAULT 'main', -- main, sidebar, footer, mobile
    brand_profile_id INTEGER REFERENCES theming.brand_profiles(id) ON DELETE CASCADE,
    menu_items JSONB NOT NULL DEFAULT '[]',
    permissions JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, brand_profile_id)
);

-- Deployment configurations for different environments
CREATE TABLE IF NOT EXISTS theming.deployment_configs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    environment VARCHAR(50) NOT NULL, -- development, staging, production
    brand_profile_id INTEGER NOT NULL REFERENCES theming.brand_profiles(id) ON DELETE CASCADE,
    theme_id INTEGER REFERENCES theming.themes(id) ON DELETE SET NULL,
    feature_flags JSONB DEFAULT '{}',
    plugin_overrides JSONB DEFAULT '{}',
    custom_config JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_brand_profiles_active ON theming.brand_profiles(active);
CREATE INDEX IF NOT EXISTS idx_themes_brand_profile ON theming.themes(brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_themes_active ON theming.themes(active);
CREATE INDEX IF NOT EXISTS idx_user_theme_preferences_user ON theming.user_theme_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_enabled ON plugins.registry(enabled);
CREATE INDEX IF NOT EXISTS idx_plugin_configurations_user ON plugins.configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_active ON plugins.feature_flags(active);
CREATE INDEX IF NOT EXISTS idx_user_feature_flags_user ON plugins.user_feature_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_navigation_menus_brand ON theming.navigation_menus(brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_deployment_configs_env ON theming.deployment_configs(environment);

-- Functions for theme management

-- Function to get effective theme for user
CREATE OR REPLACE FUNCTION theming.get_user_theme(
    p_user_id UUID,
    p_brand_profile_name VARCHAR(100) DEFAULT 'default'
) RETURNS JSONB AS $$
DECLARE
    brand_profile_record RECORD;
    theme_record RECORD;
    user_preferences RECORD;
    result JSONB;
BEGIN
    -- Get brand profile
    SELECT * INTO brand_profile_record
    FROM theming.brand_profiles
    WHERE name = p_brand_profile_name AND active = true;
    
    IF NOT FOUND THEN
        -- Get default brand profile
        SELECT * INTO brand_profile_record
        FROM theming.brand_profiles
        WHERE active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;
    
    -- Get user theme preferences
    SELECT * INTO user_preferences
    FROM theming.user_theme_preferences
    WHERE user_id = p_user_id;
    
    -- Get theme (user preference or brand default)
    IF user_preferences.theme_id IS NOT NULL THEN
        SELECT * INTO theme_record
        FROM theming.themes
        WHERE id = user_preferences.theme_id AND active = true;
    END IF;
    
    -- Fallback to brand profile default theme
    IF theme_record IS NULL THEN
        SELECT * INTO theme_record
        FROM theming.themes
        WHERE brand_profile_id = brand_profile_record.id 
        AND active = true 
        AND is_default = true
        LIMIT 1;
    END IF;
    
    -- Final fallback to any active theme
    IF theme_record IS NULL THEN
        SELECT * INTO theme_record
        FROM theming.themes
        WHERE active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;
    
    -- Build result object
    result := jsonb_build_object(
        'brand_profile', row_to_json(brand_profile_record),
        'theme', row_to_json(theme_record),
        'user_preferences', row_to_json(user_preferences),
        'effective_config', jsonb_build_object(
            'primary_color', brand_profile_record.primary_color,
            'secondary_color', brand_profile_record.secondary_color,
            'accent_color', brand_profile_record.accent_color,
            'background_color', brand_profile_record.background_color,
            'text_color', brand_profile_record.text_color,
            'font_family', brand_profile_record.font_family,
            'theme_type', COALESCE(theme_record.theme_type, 'light'),
            'css_variables', COALESCE(theme_record.css_variables, '{}'),
            'component_overrides', COALESCE(theme_record.component_overrides, '{}'),
            'custom_overrides', COALESCE(user_preferences.custom_overrides, '{}')
        )
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get feature flag value for user
CREATE OR REPLACE FUNCTION plugins.get_feature_flag_value(
    p_flag_name VARCHAR(100),
    p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    flag_record RECORD;
    user_override RECORD;
    result JSONB;
    user_in_rollout BOOLEAN;
BEGIN
    -- Get feature flag
    SELECT * INTO flag_record
    FROM plugins.feature_flags
    WHERE name = p_flag_name AND active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('enabled', false, 'value', null, 'reason', 'flag_not_found');
    END IF;
    
    -- Check for user-specific override
    IF p_user_id IS NOT NULL THEN
        SELECT * INTO user_override
        FROM plugins.user_feature_flags
        WHERE feature_flag_id = flag_record.id AND user_id = p_user_id;
        
        IF FOUND THEN
            RETURN jsonb_build_object(
                'enabled', true,
                'value', user_override.override_value,
                'reason', 'user_override',
                'override_reason', user_override.reason
            );
        END IF;
    END IF;
    
    -- Check rollout percentage (simple hash-based rollout)
    IF flag_record.rollout_percentage < 100 AND p_user_id IS NOT NULL THEN
        user_in_rollout := (hashtext(p_user_id::text || flag_record.name) % 100) < flag_record.rollout_percentage;
        
        IF NOT user_in_rollout THEN
            RETURN jsonb_build_object(
                'enabled', false,
                'value', flag_record.default_value,
                'reason', 'not_in_rollout'
            );
        END IF;
    END IF;
    
    -- Return current value
    RETURN jsonb_build_object(
        'enabled', true,
        'value', flag_record.current_value,
        'reason', 'active_flag',
        'rollout_percentage', flag_record.rollout_percentage
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get navigation menu for brand profile
CREATE OR REPLACE FUNCTION theming.get_navigation_menu(
    p_menu_type VARCHAR(50) DEFAULT 'main',
    p_brand_profile_name VARCHAR(100) DEFAULT 'default',
    p_user_permissions JSONB DEFAULT '[]'
) RETURNS JSONB AS $$
DECLARE
    brand_profile_record RECORD;
    menu_record RECORD;
    filtered_items JSONB;
BEGIN
    -- Get brand profile
    SELECT * INTO brand_profile_record
    FROM theming.brand_profiles
    WHERE name = p_brand_profile_name AND active = true;
    
    IF NOT FOUND THEN
        SELECT * INTO brand_profile_record
        FROM theming.brand_profiles
        WHERE active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;
    
    -- Get navigation menu
    SELECT * INTO menu_record
    FROM theming.navigation_menus
    WHERE menu_type = p_menu_type 
    AND brand_profile_id = brand_profile_record.id 
    AND active = true
    ORDER BY sort_order ASC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('menu_items', '[]', 'menu_type', p_menu_type);
    END IF;
    
    -- TODO: Filter menu items based on user permissions
    -- For now, return all items
    filtered_items := menu_record.menu_items;
    
    RETURN jsonb_build_object(
        'id', menu_record.id,
        'name', menu_record.name,
        'display_name', menu_record.display_name,
        'menu_type', menu_record.menu_type,
        'menu_items', filtered_items,
        'brand_profile', brand_profile_record.name
    );
END;
$$ LANGUAGE plpgsql;

-- Insert default brand profiles
INSERT INTO theming.brand_profiles (name, display_name, description, primary_color, secondary_color, accent_color) VALUES
('default', 'Site Template', 'Default brand profile for Site Template', '#007bff', '#6c757d', '#28a745'),
('dark-theme', 'Site Template Dark', 'Dark theme brand profile', '#0d6efd', '#495057', '#198754'),
('corporate', 'Corporate Blue', 'Professional corporate branding', '#0056b3', '#6f7070', '#17a2b8'),
('startup', 'Startup Green', 'Modern startup branding', '#28a745', '#ffc107', '#fd7e14')
ON CONFLICT (name) DO NOTHING;

-- Insert default themes
INSERT INTO theming.themes (name, display_name, description, theme_type, css_variables, brand_profile_id, is_default) VALUES
('light-default', 'Light Theme', 'Default light theme', 'light', 
 '{"--background": "#ffffff", "--foreground": "#212529", "--muted": "#f8f9fa", "--border": "#dee2e6"}',
 (SELECT id FROM theming.brand_profiles WHERE name = 'default'), true),
('dark-default', 'Dark Theme', 'Default dark theme', 'dark',
 '{"--background": "#212529", "--foreground": "#ffffff", "--muted": "#343a40", "--border": "#495057"}',
 (SELECT id FROM theming.brand_profiles WHERE name = 'dark-theme'), true),
('corporate-light', 'Corporate Light', 'Corporate light theme', 'light',
 '{"--background": "#ffffff", "--foreground": "#0056b3", "--muted": "#f8f9fa", "--accent": "#17a2b8"}',
 (SELECT id FROM theming.brand_profiles WHERE name = 'corporate'), true),
('startup-modern', 'Startup Modern', 'Modern startup theme', 'light',
 '{"--background": "#ffffff", "--foreground": "#212529", "--accent": "#28a745", "--warning": "#ffc107"}',
 (SELECT id FROM theming.brand_profiles WHERE name = 'startup'), true)
ON CONFLICT (name, brand_profile_id) DO NOTHING;

-- Insert default feature flags
INSERT INTO plugins.feature_flags (name, display_name, description, flag_type, default_value, current_value, rollout_percentage) VALUES
('enable_dark_mode', 'Dark Mode', 'Enable dark mode theme switching', 'boolean', 'true', 'true', 100),
('enable_plugin_system', 'Plugin System', 'Enable the plugin system', 'boolean', 'false', 'true', 100),
('enable_custom_themes', 'Custom Themes', 'Allow users to create custom themes', 'boolean', 'false', 'true', 50),
('max_plugins_per_user', 'Max Plugins Per User', 'Maximum number of plugins per user', 'number', '5', '10', 100),
('enable_theme_preview', 'Theme Preview', 'Enable live theme preview', 'boolean', 'false', 'true', 75),
('enable_advanced_theming', 'Advanced Theming', 'Enable advanced theming features', 'boolean', 'false', 'false', 25)
ON CONFLICT (name) DO NOTHING;

-- Insert sample plugins
INSERT INTO plugins.registry (name, display_name, description, version, author, plugin_type, entry_point, dependencies, permissions) VALUES
('dashboard-widgets', 'Dashboard Widgets', 'Customizable dashboard widget system', '1.0.0', 'Site Template', 'component', 'widgets/DashboardWidgets.js', '["react", "react-dom"]', '["read:dashboard"]'),
('theme-customizer', 'Theme Customizer', 'Advanced theme customization tools', '1.0.0', 'Site Template', 'component', 'theming/ThemeCustomizer.js', '["react", "color"]', '["admin:themes"]'),
('analytics-plugin', 'Analytics Integration', 'Google Analytics and custom analytics', '1.0.0', 'Site Template', 'service', 'analytics/AnalyticsService.js', '[]', '["admin:analytics"]'),
('notification-center', 'Notification Center', 'Advanced notification management', '1.0.0', 'Site Template', 'component', 'notifications/NotificationCenter.js', '["react"]', '["read:notifications"]')
ON CONFLICT (name) DO NOTHING;

-- Insert default navigation menus
INSERT INTO theming.navigation_menus (name, display_name, menu_type, brand_profile_id, menu_items, permissions) VALUES
('main-nav', 'Main Navigation', 'main', 
 (SELECT id FROM theming.brand_profiles WHERE name = 'default'),
 '[
   {"label": "Dashboard", "path": "/dashboard", "icon": "dashboard", "permissions": ["read:dashboard"]},
   {"label": "API Integration", "path": "/api", "icon": "api", "permissions": ["read:api"]},
   {"label": "Themes", "path": "/themes", "icon": "palette", "permissions": ["read:themes"]},
   {"label": "Plugins", "path": "/plugins", "icon": "extension", "permissions": ["read:plugins"]},
   {"label": "Settings", "path": "/settings", "icon": "settings", "permissions": ["read:settings"]}
 ]', '["authenticated"]'),
('admin-nav', 'Admin Navigation', 'sidebar',
 (SELECT id FROM theming.brand_profiles WHERE name = 'default'),
 '[
   {"label": "User Management", "path": "/admin/users", "icon": "users", "permissions": ["admin:users"]},
   {"label": "System Settings", "path": "/admin/system", "icon": "system", "permissions": ["admin:system"]},
   {"label": "Feature Flags", "path": "/admin/features", "icon": "flag", "permissions": ["admin:features"]},
   {"label": "Plugin Management", "path": "/admin/plugins", "icon": "extension", "permissions": ["admin:plugins"]}
 ]', '["admin"]')
ON CONFLICT (name, brand_profile_id) DO NOTHING;

-- Grant permissions
GRANT USAGE ON SCHEMA theming TO PUBLIC;
GRANT USAGE ON SCHEMA plugins TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA theming TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA plugins TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA theming TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA plugins TO PUBLIC;

-- Comments for documentation
COMMENT ON SCHEMA theming IS 'Theme and branding system for multi-tenant theming support';
COMMENT ON SCHEMA plugins IS 'Plugin system for modular functionality and feature toggles';
COMMENT ON TABLE theming.brand_profiles IS 'Brand profiles for multi-tenant theming with customizable colors and assets';
COMMENT ON TABLE theming.themes IS 'Theme configurations with CSS variables and component overrides';
COMMENT ON TABLE plugins.feature_flags IS 'Feature flag system for gradual rollouts and A/B testing';
COMMENT ON TABLE plugins.registry IS 'Plugin registry with metadata and installation information';
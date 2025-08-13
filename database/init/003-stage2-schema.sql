-- Stage 2: Basic User Features - Database Schema
-- User profiles and notification preferences

-- User profiles table
CREATE TABLE IF NOT EXISTS auth.user_profiles (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    bio TEXT,
    avatar_url VARCHAR(500),
    location VARCHAR(100),
    website_url VARCHAR(500),
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'en',
    theme VARCHAR(20) DEFAULT 'light',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS auth.notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email_notifications BOOLEAN DEFAULT true,
    push_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    marketing_emails BOOLEAN DEFAULT true,
    security_alerts BOOLEAN DEFAULT true,
    product_updates BOOLEAN DEFAULT true,
    weekly_digest BOOLEAN DEFAULT true,
    activity_notifications BOOLEAN DEFAULT true,
    comment_notifications BOOLEAN DEFAULT true,
    mention_notifications BOOLEAN DEFAULT true,
    frequency VARCHAR(20) DEFAULT 'immediate', -- immediate, daily, weekly
    quiet_hours_start TIME DEFAULT '22:00:00',
    quiet_hours_end TIME DEFAULT '08:00:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- User activity tracking table
CREATE TABLE IF NOT EXISTS auth.user_activity (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    activity_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON auth.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON auth.notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON auth.user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_type ON auth.user_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON auth.user_activity(created_at);

-- Function to create default profile and notification preferences
CREATE OR REPLACE FUNCTION auth.create_default_user_settings(p_user_id INTEGER)
RETURNS VOID AS $$
BEGIN
    -- Create default profile
    INSERT INTO auth.user_profiles (user_id, display_name)
    VALUES (p_user_id, (SELECT name FROM auth.users WHERE id = p_user_id))
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Create default notification preferences
    INSERT INTO auth.notification_preferences (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Function to update user profile
CREATE OR REPLACE FUNCTION auth.update_user_profile(
    p_user_id INTEGER,
    p_display_name VARCHAR(100) DEFAULT NULL,
    p_bio TEXT DEFAULT NULL,
    p_avatar_url VARCHAR(500) DEFAULT NULL,
    p_location VARCHAR(100) DEFAULT NULL,
    p_website_url VARCHAR(500) DEFAULT NULL,
    p_timezone VARCHAR(50) DEFAULT NULL,
    p_language VARCHAR(10) DEFAULT NULL,
    p_theme VARCHAR(20) DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    UPDATE auth.user_profiles 
    SET 
        display_name = COALESCE(p_display_name, display_name),
        bio = COALESCE(p_bio, bio),
        avatar_url = COALESCE(p_avatar_url, avatar_url),
        location = COALESCE(p_location, location),
        website_url = COALESCE(p_website_url, website_url),
        timezone = COALESCE(p_timezone, timezone),
        language = COALESCE(p_language, language),
        theme = COALESCE(p_theme, theme),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Return updated profile
    SELECT to_jsonb(up.*) INTO result
    FROM auth.user_profiles up 
    WHERE up.user_id = p_user_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to update notification preferences
CREATE OR REPLACE FUNCTION auth.update_notification_preferences(
    p_user_id INTEGER,
    p_preferences JSONB
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    UPDATE auth.notification_preferences 
    SET 
        email_notifications = COALESCE((p_preferences->>'email_notifications')::BOOLEAN, email_notifications),
        push_notifications = COALESCE((p_preferences->>'push_notifications')::BOOLEAN, push_notifications),
        sms_notifications = COALESCE((p_preferences->>'sms_notifications')::BOOLEAN, sms_notifications),
        marketing_emails = COALESCE((p_preferences->>'marketing_emails')::BOOLEAN, marketing_emails),
        security_alerts = COALESCE((p_preferences->>'security_alerts')::BOOLEAN, security_alerts),
        product_updates = COALESCE((p_preferences->>'product_updates')::BOOLEAN, product_updates),
        weekly_digest = COALESCE((p_preferences->>'weekly_digest')::BOOLEAN, weekly_digest),
        activity_notifications = COALESCE((p_preferences->>'activity_notifications')::BOOLEAN, activity_notifications),
        comment_notifications = COALESCE((p_preferences->>'comment_notifications')::BOOLEAN, comment_notifications),
        mention_notifications = COALESCE((p_preferences->>'mention_notifications')::BOOLEAN, mention_notifications),
        frequency = COALESCE(p_preferences->>'frequency', frequency),
        quiet_hours_start = COALESCE((p_preferences->>'quiet_hours_start')::TIME, quiet_hours_start),
        quiet_hours_end = COALESCE((p_preferences->>'quiet_hours_end')::TIME, quiet_hours_end),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Return updated preferences
    SELECT to_jsonb(np.*) INTO result
    FROM auth.notification_preferences np 
    WHERE np.user_id = p_user_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to log user activity
CREATE OR REPLACE FUNCTION auth.log_user_activity(
    p_user_id INTEGER,
    p_activity_type VARCHAR(50),
    p_activity_data JSONB DEFAULT '{}',
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    activity_id INTEGER;
BEGIN
    INSERT INTO auth.user_activity (
        user_id,
        activity_type,
        activity_data,
        ip_address,
        user_agent
    ) VALUES (
        p_user_id,
        p_activity_type,
        p_activity_data,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO activity_id;
    
    RETURN activity_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get user profile with preferences
CREATE OR REPLACE FUNCTION auth.get_user_profile_complete(p_user_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'user', to_jsonb(u.*) - 'password_hash' - 'encrypted_email' - 'email_iv' - 'email_auth_tag',
        'profile', to_jsonb(up.*),
        'notification_preferences', to_jsonb(np.*),
        'activity_stats', jsonb_build_object(
            'total_activities', COUNT(ua.id),
            'last_activity', MAX(ua.created_at)
        )
    ) INTO result
    FROM auth.users u
    LEFT JOIN auth.user_profiles up ON u.id = up.user_id
    LEFT JOIN auth.notification_preferences np ON u.id = np.user_id
    LEFT JOIN auth.user_activity ua ON u.id = ua.user_id
    WHERE u.id = p_user_id
    GROUP BY u.id, up.id, np.id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create default settings for new users
CREATE OR REPLACE FUNCTION auth.auto_create_user_settings()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM auth.create_default_user_settings(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_auto_create_user_settings ON auth.users;
CREATE TRIGGER trigger_auto_create_user_settings
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION auth.auto_create_user_settings();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON auth.user_profiles TO admin;
GRANT SELECT, INSERT, UPDATE ON auth.notification_preferences TO admin;
GRANT SELECT, INSERT, UPDATE ON auth.user_activity TO admin;
GRANT USAGE ON auth.user_profiles_id_seq TO admin;
GRANT USAGE ON auth.notification_preferences_id_seq TO admin;
GRANT USAGE ON auth.user_activity_id_seq TO admin;
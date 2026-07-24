-- Create notification_preferences table for granular per-type, per-channel preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL,
    
    -- Channel-level master toggles
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    push_enabled BOOLEAN DEFAULT TRUE,
    in_app_enabled BOOLEAN DEFAULT TRUE,
    webhook_enabled BOOLEAN DEFAULT FALSE,
    
    -- Contact details
    email VARCHAR(255),
    phone_number VARCHAR(32),
    fcm_token TEXT,
    webhook_url VARCHAR(512),
    
    -- Per-notification-type channel preferences
    -- JSON object mapping notification type -> array of enabled channels
    -- e.g. {"booking": ["email", "in_app"], "reminder": ["email", "sms", "push", "in_app"], "refund": ["email", "in_app"], "promotional": ["email"]}
    type_channel_preferences JSONB DEFAULT '{}'::jsonb,
    
    -- Quiet hours / do-not-disturb settings
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start VARCHAR(5) DEFAULT '22:00',  -- HH:MM format
    quiet_hours_end VARCHAR(5) DEFAULT '07:00',    -- HH:MM format
    quiet_hours_timezone VARCHAR(64) DEFAULT 'UTC',
    
    -- Notification frequency/digest settings
    digest_enabled BOOLEAN DEFAULT FALSE,
    digest_frequency VARCHAR(16) DEFAULT 'daily',  -- 'instant', 'daily', 'weekly'
    last_digest_sent_at TIMESTAMPTZ,
    
    -- Rate limiting per channel (max notifications per hour)
    max_email_per_hour INTEGER DEFAULT 10,
    max_sms_per_hour INTEGER DEFAULT 5,
    max_push_per_hour INTEGER DEFAULT 20,
    max_in_app_per_hour INTEGER DEFAULT 50,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX idx_notification_preferences_email ON notification_preferences(email);
CREATE INDEX idx_notification_preferences_digest ON notification_preferences(digest_enabled, digest_frequency);

-- Create trigger for updated_at
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create in_app_notifications table for storing in-app notifications
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL,
    type VARCHAR(32) NOT NULL,  -- 'booking', 'reminder', 'refund', 'promotional', 'price_alert', 'system'
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,  -- Additional payload data
    is_read BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for in_app_notifications
CREATE INDEX idx_in_app_notifications_user_id ON in_app_notifications(user_id);
CREATE INDEX idx_in_app_notifications_user_unread ON in_app_notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_in_app_notifications_created_at ON in_app_notifications(created_at DESC);

-- Create notification_delivery_log table for tracking multi-channel delivery
CREATE TABLE IF NOT EXISTS notification_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID,  -- References in_app_notifications.id if applicable
    user_id VARCHAR(128) NOT NULL,
    notification_type VARCHAR(32) NOT NULL,
    channel VARCHAR(16) NOT NULL,  -- 'email', 'sms', 'push', 'in_app', 'webhook'
    status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'delivered', 'failed', 'bounced', 'suppressed'
    recipient VARCHAR(255),  -- email address, phone number, device token, etc.
    subject VARCHAR(255),  -- Email subject or push title
    body TEXT,  -- Rendered message body
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for notification_delivery_log
CREATE INDEX idx_notification_delivery_log_user_id ON notification_delivery_log(user_id);
CREATE INDEX idx_notification_delivery_log_status ON notification_delivery_log(status);
CREATE INDEX idx_notification_delivery_log_channel ON notification_delivery_log(channel);
CREATE INDEX idx_notification_delivery_log_next_retry ON notification_delivery_log(next_retry_at) WHERE status = 'pending' OR status = 'failed';
CREATE INDEX idx_notification_delivery_log_created_at ON notification_delivery_log(created_at DESC);

-- Create trigger for notification_delivery_log updated_at
CREATE TRIGGER update_notification_delivery_log_updated_at BEFORE UPDATE ON notification_delivery_log
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Create group_booking_templates table
CREATE TABLE IF NOT EXISTS group_booking_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    visibility VARCHAR(32) DEFAULT 'private',
    template_config JSONB NOT NULL,
    usage_count INTEGER DEFAULT 0,
    organization_id VARCHAR(255),
    created_by_id VARCHAR(128),
    tags JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_group_booking_templates_visibility ON group_booking_templates(visibility);
CREATE INDEX idx_group_booking_templates_organization_id ON group_booking_templates(organization_id);
CREATE INDEX idx_group_booking_templates_created_by_id ON group_booking_templates(created_by_id);
CREATE INDEX idx_group_booking_templates_is_active ON group_booking_templates(is_active);

-- Create trigger for updated_at
CREATE TRIGGER update_group_booking_templates_updated_at BEFORE UPDATE ON group_booking_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

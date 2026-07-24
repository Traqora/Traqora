-- Create bulk_bookings table
CREATE TABLE IF NOT EXISTS bulk_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) DEFAULT 'custom',
    status VARCHAR(32) DEFAULT 'pending',
    total_bookings INTEGER NOT NULL,
    completed_bookings INTEGER DEFAULT 0,
    failed_bookings INTEGER DEFAULT 0,
    total_amount_cents INTEGER NOT NULL,
    processed_amount_cents INTEGER DEFAULT 0,
    organization_name VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(255),
    metadata JSONB,
    notes TEXT,
    failure_reason TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add bulk_booking_id column to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS bulk_booking_id UUID REFERENCES bulk_bookings(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX idx_bulk_bookings_status ON bulk_bookings(status);
CREATE INDEX idx_bulk_bookings_type ON bulk_bookings(type);
CREATE INDEX idx_bulk_bookings_contact_email ON bulk_bookings(contact_email);
CREATE INDEX idx_bulk_bookings_organization_name ON bulk_bookings(organization_name);
CREATE INDEX idx_bookings_bulk_booking_id ON bookings(bulk_booking_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bulk_bookings_updated_at BEFORE UPDATE ON bulk_bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

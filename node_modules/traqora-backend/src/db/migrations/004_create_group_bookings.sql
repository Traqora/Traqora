-- Create group_bookings table
CREATE TABLE IF NOT EXISTS group_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128),
    group_name VARCHAR(255) NOT NULL,
    flight_id VARCHAR(36) NOT NULL,
    status VARCHAR(32) DEFAULT 'pending',
    total_amount_cents INTEGER NOT NULL,
    paid_amount_cents INTEGER DEFAULT 0,
    split_method VARCHAR(32) DEFAULT 'equal',
    split_config JSONB,
    organizer_email VARCHAR(255),
    organizer_wallet_address VARCHAR(128),
    shared_itinerary TEXT,
    notes TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create group_members table
CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_booking_id UUID NOT NULL REFERENCES group_bookings(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    stellar_address VARCHAR(56),
    status VARCHAR(32) DEFAULT 'pending',
    role VARCHAR(20) DEFAULT 'member',
    share_amount_cents INTEGER,
    is_invited BOOLEAN DEFAULT FALSE,
    invited_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    invite_token UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_group_bookings_status ON group_bookings(status);
CREATE INDEX idx_group_bookings_flight_id ON group_bookings(flight_id);
CREATE INDEX idx_group_bookings_organizer_email ON group_bookings(organizer_email);
CREATE INDEX idx_group_members_group_booking_id ON group_members(group_booking_id);
CREATE INDEX idx_group_members_email ON group_members(email);
CREATE INDEX idx_group_members_status ON group_members(status);
CREATE INDEX idx_group_members_invite_token ON group_members(invite_token);
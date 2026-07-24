-- Create group_booking_flights table for multi-flight itineraries
CREATE TABLE IF NOT EXISTS group_booking_flights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_booking_id UUID NOT NULL REFERENCES group_bookings(id) ON DELETE CASCADE,
    flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    sequence_order INTEGER DEFAULT 1,
    flight_type VARCHAR(32) DEFAULT 'outbound',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_group_booking_flights_group_booking_id ON group_booking_flights(group_booking_id);
CREATE INDEX idx_group_booking_flights_flight_id ON group_booking_flights(flight_id);
CREATE INDEX idx_group_booking_flights_sequence_order ON group_booking_flights(sequence_order);

-- Create trigger for updated_at
CREATE TRIGGER update_group_booking_flights_updated_at BEFORE UPDATE ON group_booking_flights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Make flight_id in group_bookings nullable (since we now use group_booking_flights)
ALTER TABLE group_bookings ALTER COLUMN flight_id DROP NOT NULL;
ALTER TABLE group_bookings ALTER COLUMN flight_id SET NULL;

CREATE TABLE IF NOT EXISTS flights (
  id UUID PRIMARY KEY,
  origin VARCHAR(8) NOT NULL,
  destination VARCHAR(8) NOT NULL,
  departure_date DATE NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  airline_code VARCHAR(8) NOT NULL,
  stops SMALLINT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  rating NUMERIC(3,2) NOT NULL,
  available_seats INTEGER NOT NULL,
  cabin_class VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flights_route_date_class
  ON flights (origin, destination, departure_date, cabin_class);

CREATE INDEX IF NOT EXISTS idx_flights_price
  ON flights (price);

CREATE INDEX IF NOT EXISTS idx_flights_airline
  ON flights (airline_code);

CREATE INDEX IF NOT EXISTS idx_flights_stops_duration
  ON flights (stops, duration_minutes);

CREATE INDEX IF NOT EXISTS idx_flights_departure_time
  ON flights (departure_time);

CREATE INDEX IF NOT EXISTS idx_flights_rating
  ON flights (rating DESC);
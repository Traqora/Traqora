-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  stellar_address VARCHAR(56),
  reputation_score DECIMAL(3,2) DEFAULT 0.00,
  total_trades INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create listings table
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell')),
  token VARCHAR(10) NOT NULL,
  amount DECIMAL(20,7) NOT NULL,
  rate DECIMAL(20,7) NOT NULL,
  fiat_currency VARCHAR(3) NOT NULL,
  payment_method VARCHAR(50),
  min_amount DECIMAL(20,7),
  max_amount DECIMAL(20,7),
  description TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create escrows table
CREATE TABLE IF NOT EXISTS escrows (
  id VARCHAR(20) PRIMARY KEY,
  listing_id UUID REFERENCES listings(id),
  buyer_id UUID REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
  token VARCHAR(10) NOT NULL,
  amount DECIMAL(20,7) NOT NULL,
  fiat_amount DECIMAL(20,2) NOT NULL,
  fiat_currency VARCHAR(3) NOT NULL,
  status VARCHAR(30) DEFAULT 'created' CHECK (status IN ('created', 'awaiting_payment', 'payment_confirmed', 'completed', 'disputed', 'cancelled')),
  trustless_work_contract_id VARCHAR(100),
  payment_receipt_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create escrow_milestones table
CREATE TABLE IF NOT EXISTS escrow_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id VARCHAR(20) REFERENCES escrows(id) ON DELETE CASCADE,
  milestone_number INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create token_operations table (for admin mint/burn tracking)
CREATE TABLE IF NOT EXISTS token_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type VARCHAR(10) NOT NULL CHECK (operation_type IN ('mint', 'burn')),
  token VARCHAR(10) NOT NULL,
  amount DECIMAL(20,7) NOT NULL,
  stellar_address VARCHAR(56) NOT NULL,
  transaction_hash VARCHAR(64),
  memo TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_listings_token ON listings(token);
CREATE INDEX IF NOT EXISTS idx_listings_type ON listings(type);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status);
CREATE INDEX IF NOT EXISTS idx_escrows_buyer ON escrows(buyer_id);
CREATE INDEX IF NOT EXISTS idx_escrows_seller ON escrows(seller_id);

-- Create merchants table
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE,
  display_name TEXT NOT NULL,
  is_public BOOLEAN DEFAULT TRUE,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','revoked')),
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  location TEXT,
  languages TEXT[],
  socials JSONB,
  rating NUMERIC DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  volume_traded NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_user ON merchants(user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_public ON merchants(is_public);
CREATE INDEX IF NOT EXISTS idx_listings_merchant ON listings(merchant_id);

-- Insert sample data
INSERT INTO users (email, stellar_address, reputation_score, total_trades) VALUES
('alice@example.com', 'GDXXX1234567890ABCDEF', 4.8, 23),
('bob@example.com', 'GDYYY9876543210FEDCBA', 4.9, 45),
('charlie@example.com', 'GDZZZ5555555555555555', 4.7, 12)
ON CONFLICT (email) DO NOTHING;

-- Create waitlist_submissions table for marketing waitlist + OTP verification
CREATE TABLE IF NOT EXISTS waitlist_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  company TEXT,
  role TEXT,
  country TEXT,
  source TEXT,
  use_case TEXT,
  notes TEXT,
  otp VARCHAR(6),
  otp_expires_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Helpful index to prune expired OTP lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_otp_expires
  ON waitlist_submissions(otp_expires_at);

-- Create refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reason VARCHAR(64) NOT NULL,
  reason_details TEXT,
  requested_amount_cents INTEGER NOT NULL,
  approved_amount_cents INTEGER,
  processing_fee_cents INTEGER NOT NULL DEFAULT 0,
  is_eligible BOOLEAN NOT NULL DEFAULT false,
  eligibility_notes TEXT,
  requires_manual_review BOOLEAN NOT NULL DEFAULT false,
  reviewed_by VARCHAR(128),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  stripe_refund_id VARCHAR(128),
  soroban_unsigned_xdr TEXT,
  soroban_tx_hash VARCHAR(128),
  contract_submit_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  requested_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_refunds_booking_id ON refunds(booking_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_refund_id ON refunds(stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_refunds_soroban_tx_hash ON refunds(soroban_tx_hash);
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_refunds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refunds_updated_at_trigger
BEFORE UPDATE ON refunds
FOR EACH ROW
EXECUTE FUNCTION update_refunds_updated_at();

-- Add audit logging table for refund actions
CREATE TABLE IF NOT EXISTS refund_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
  action VARCHAR(64) NOT NULL,
  actor VARCHAR(128),
  previous_status VARCHAR(32),
  new_status VARCHAR(32),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_audit_log_refund_id ON refund_audit_log(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_audit_log_created_at ON refund_audit_log(created_at);

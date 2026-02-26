-- Add time-locked refund safety mechanism fields to refunds table

-- Add new status types for delayed refunds
-- Note: This assumes the status column uses CHECK constraint or enum type
-- Adjust based on your actual database setup

-- Add delayed refund fields
ALTER TABLE refunds
ADD COLUMN IF NOT EXISTS is_delayed BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS delayed_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delayed_ledger_sequence INTEGER,
ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(128),
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS emergency_override BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS emergency_override_by VARCHAR(128),
ADD COLUMN IF NOT EXISTS emergency_override_reason TEXT;

-- Create index for efficient querying of delayed refunds
CREATE INDEX IF NOT EXISTS idx_refunds_delayed_pending 
ON refunds(status, is_delayed, delayed_until) 
WHERE status = 'delayed_pending' AND is_delayed = TRUE;

-- Create index for cancelled refunds
CREATE INDEX IF NOT EXISTS idx_refunds_cancelled 
ON refunds(cancelled_by, cancelled_at) 
WHERE cancelled_by IS NOT NULL;

-- Create index for emergency overrides (for audit purposes)
CREATE INDEX IF NOT EXISTS idx_refunds_emergency_override 
ON refunds(emergency_override, emergency_override_by) 
WHERE emergency_override = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN refunds.is_delayed IS 'Indicates if this refund is subject to time-lock delay';
COMMENT ON COLUMN refunds.delayed_until IS 'Timestamp when the refund can be processed (after timelock expires)';
COMMENT ON COLUMN refunds.delayed_ledger_sequence IS 'Stellar ledger sequence for time measurement (optional)';
COMMENT ON COLUMN refunds.cancelled_by IS 'User who cancelled the delayed refund request';
COMMENT ON COLUMN refunds.cancelled_at IS 'Timestamp when the refund was cancelled';
COMMENT ON COLUMN refunds.cancellation_reason IS 'Reason for cancelling the refund request';
COMMENT ON COLUMN refunds.emergency_override IS 'Indicates if emergency override was applied to bypass delay';
COMMENT ON COLUMN refunds.emergency_override_by IS 'Admin who applied the emergency override';
COMMENT ON COLUMN refunds.emergency_override_reason IS 'Justification for emergency override';

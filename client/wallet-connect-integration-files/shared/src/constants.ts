// Shared constants
export const SUPPORTED_CURRENCIES = ['CRCX', 'MXNX', 'USDC'] as const;

export const ESCROW_STATUSES = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  DISPUTED: 'disputed',
} as const;

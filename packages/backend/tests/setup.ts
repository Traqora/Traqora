process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-traqora-database-encryption-!!!';

process.env.BOOKING_CONTRACT_ID = 'CTESTBOOKING';
process.env.AIRLINE_CONTRACT_ID = 'CTESTAIRLINE';
process.env.REFUND_CONTRACT_ID = 'CTESTREFUND';
process.env.LOYALTY_CONTRACT_ID = 'CTESTLOYALTY';
process.env.GOVERNANCE_CONTRACT_ID = 'CTESTGOV';
process.env.TOKEN_CONTRACT_ID = 'CTESTTOKEN';
process.env.FLIGHT_REGISTRY_CONTRACT_ID = 'CTESTREG';

import { loadConfig } from '../src/config';
loadConfig().catch(() => {});

// Jest setup to resolve transitive dependency conflict with formidable/supertest
jest.mock('@paralleldrive/cuid2', () => {
  return {
    init: () => () => Math.random().toString(36).substring(2),
    createId: () => Math.random().toString(36).substring(2),
  };
});

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-traqora-database-encryption-!!!';

// Jest setup to resolve transitive dependency conflict with formidable/supertest
jest.mock('@paralleldrive/cuid2', () => {
  return {
    init: () => () => Math.random().toString(36).substring(2),
    createId: () => Math.random().toString(36).substring(2),
  };
});

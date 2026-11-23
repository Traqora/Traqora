const { submitSupplierBooking } = require('./booking');

describe('submitSupplierBooking', () => {
  it('should allow unique booking submissions with idempotencyKey', () => {
    const res = submitSupplierBooking({ idempotencyKey: 'key-1' });
    expect(res.success).toBe(true);
  });

  it('should throw error on duplicate submission', () => {
    const key = 'key-duplicate';
    submitSupplierBooking({ idempotencyKey: key });
    expect(() => submitSupplierBooking({ idempotencyKey: key })).toThrow('Duplicate supplier booking submission detected');
  });

  it('should throw error when idempotencyKey is missing', () => {
    expect(() => submitSupplierBooking({})).toThrow('Missing idempotencyKey for booking submission');
  });
});

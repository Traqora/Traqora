import { validateTravelerContact } from '../travelerContactValidator';

describe('travelerContactValidator', () => {
  it('accepts valid email', () => {
    const res = validateTravelerContact({ email: ' traveler@Example.com ' });
    expect(res.valid).toBe(true);
    expect(res.normalizedEmail).toBe('traveler@example.com');
  });

  it('accepts valid phone', () => {
    const res = validateTravelerContact({ phone: '+1 (555) 019-2834' });
    expect(res.valid).toBe(true);
    expect(res.normalizedPhone).toBe('+15550192834');
  });

  it('rejects when both are missing', () => {
    const res = validateTravelerContact({});
    expect(res.valid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('rejects invalid email format', () => {
    const res = validateTravelerContact({ email: 'not-an-email' });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('email');
  });

  it('rejects invalid phone format', () => {
    const res = validateTravelerContact({ phone: 'abc' });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('phone');
  });
});

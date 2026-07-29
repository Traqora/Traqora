import { redactFields } from '../audit';

describe('audit middleware', () => {
  describe('redactFields', () => {
    it('should redact sensitive fields', () => {
      const input = { password: 'secret123', name: 'John', token: 'abc' };
      const result = redactFields(input);
      expect(result.password).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.name).toBe('John');
    });

    it('should redact nested sensitive fields', () => {
      const input = { user: { password: 'secret', email: 'test@test.com' } };
      const result = redactFields(input);
      expect((result.user as Record<string, unknown>).password).toBe('[REDACTED]');
      expect((result.user as Record<string, unknown>).email).toBe('test@test.com');
    });

    it('should handle null and undefined', () => {
      expect(redactFields({})).toEqual({});
    });

    it('should handle custom mask fields', () => {
      const input = { email: 'test@test.com', ssn: '123-45-6789' };
      const result = redactFields(input, ['email']);
      expect(result.email).toBe('[REDACTED]');
      expect(result.ssn).toBe('123-45-6789');
    });

    it('should handle arrays', () => {
      const input = { items: [{ password: 'secret' }, { name: 'test' }] };
      const result = redactFields(input);
      expect(result.items).toEqual([{ password: '[REDACTED]' }, { name: 'test' }]);
    });

    it('should handle case-insensitive matching', () => {
      const input = { Password: 'secret', API_KEY: 'key123', ApiKey: 'key456' };
      const result = redactFields(input);
      expect(result.Password).toBe('[REDACTED]');
      expect(result.API_KEY).toBe('[REDACTED]');
      expect(result.ApiKey).toBe('[REDACTED]');
    });
  });
});

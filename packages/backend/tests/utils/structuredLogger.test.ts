import {
  CIRCULAR,
  MAX_DEPTH_REACHED,
  REDACTED,
  SENSITIVE_LOG_KEYS,
  deriveEventName,
  isJsonFormat,
  isSensitiveKey,
  redactValue,
  resolveLogFormat,
  safeStringify,
  serializeError,
} from '../../src/utils/structuredLogger';

describe('structured logging contract (issue #738)', () => {
  describe('isSensitiveKey', () => {
    it.each([
      'authorization',
      'Authorization',
      'cookie',
      'set-cookie',
      'password',
      'userPassword',
      'accessToken',
      'refresh_token',
      'clientSecret',
      'apiKey',
      'api_key',
      'api-key',
      'x-api-key',
      'jwt',
    ])('redacts %s', (key) => {
      expect(isSensitiveKey(key)).toBe(true);
    });

    it.each(['flightNumber', 'amountCents', 'status', 'userId', 'event'])(
      'keeps %s',
      (key) => {
        expect(isSensitiveKey(key)).toBe(false);
      },
    );

    it('exposes a substring list for the callers that need one', () => {
      expect(SENSITIVE_LOG_KEYS).toContain('authorization');
      expect(SENSITIVE_LOG_KEYS).toContain('refresh_token');
    });
  });

  describe('redactValue — redaction', () => {
    it('redacts sensitive keys at the top level', () => {
      expect(redactValue({ authorization: 'Bearer abc', flight: 'TQ101' })).toEqual({
        authorization: REDACTED,
        flight: 'TQ101',
      });
    });

    it('redacts sensitive keys nested in objects and arrays', () => {
      const result = redactValue({
        request: { headers: { 'set-cookie': 'session=1' }, body: { password: 'hunter2' } },
        passengers: [{ name: 'Ada' }, { apiKey: 'k-123' }],
      });

      expect(result).toEqual({
        request: { headers: { 'set-cookie': REDACTED }, body: { password: REDACTED } },
        passengers: [{ name: 'Ada' }, { apiKey: REDACTED }],
      });
    });

    it('passes primitives through untouched', () => {
      expect(redactValue('hello')).toBe('hello');
      expect(redactValue(42)).toBe(42);
      expect(redactValue(true)).toBe(true);
      expect(redactValue(null)).toBeNull();
      expect(redactValue(undefined)).toBeUndefined();
    });

    it('does not mutate the input', () => {
      const input = { password: 'hunter2', nested: { token: 't' } };
      redactValue(input);
      expect(input.password).toBe('hunter2');
      expect(input.nested.token).toBe('t');
    });
  });

  describe('redactValue — failure modes', () => {
    it('marks circular references instead of overflowing the stack', () => {
      const cyclic: Record<string, unknown> = { name: 'root' };
      cyclic.self = cyclic;
      cyclic.children = [{ parent: cyclic }];

      const result = redactValue(cyclic) as Record<string, unknown>;

      expect(result.name).toBe('root');
      expect(result.self).toBe(CIRCULAR);
      expect((result.children as Array<Record<string, unknown>>)[0].parent).toBe(CIRCULAR);
    });

    it('handles self-referencing arrays', () => {
      const arr: unknown[] = ['a'];
      arr.push(arr);

      expect(redactValue(arr)).toEqual(['a', CIRCULAR]);
    });

    it('stops at the depth limit on deeply nested payloads', () => {
      let deep: Record<string, unknown> = { value: 'bottom' };
      for (let i = 0; i < 50; i += 1) {
        deep = { nested: deep };
      }

      expect(JSON.stringify(redactValue(deep))).toContain(MAX_DEPTH_REACHED);
    });

    it('coerces values JSON cannot represent', () => {
      const result = redactValue({
        big: BigInt(90071992547409911n),
        nan: Number.NaN,
        infinite: Number.POSITIVE_INFINITY,
        sym: Symbol('nope'),
        fn: () => 'x',
        when: new Date('2026-09-27T00:00:00.000Z'),
        map: new Map([['a', 1]]),
        set: new Set([1, 2]),
      }) as Record<string, unknown>;

      expect(result.big).toBe('90071992547409911n');
      expect(result.nan).toBe('NaN');
      expect(result.infinite).toBe('Infinity');
      expect(result.sym).toBe('[symbol]');
      expect(result.fn).toBe('[function]');
      expect(result.when).toBe('2026-09-27T00:00:00.000Z');
      expect(result.map).toEqual({ a: 1 });
      expect(result.set).toEqual([1, 2]);
    });

    it('survives a getter that throws', () => {
      const hostile = {
        safe: 'value',
        get boom(): unknown {
          throw new Error('getter exploded');
        },
      };

      expect(redactValue(hostile)).toEqual({ safe: 'value', boom: '[Unserializable]' });
    });

    it('redacts secrets hidden behind a throwing getter key', () => {
      const hostile = { get authorization(): unknown {
        throw new Error('never evaluated');
      } };

      expect(redactValue(hostile)).toEqual({ authorization: REDACTED });
    });
  });

  describe('serializeError', () => {
    it('serialises an Error that plain JSON.stringify would drop', () => {
      const error = new TypeError('bad input');
      expect(JSON.stringify({ error })).toBe('{"error":{}}');

      expect(serializeError(error)).toMatchObject({
        name: 'TypeError',
        message: 'bad input',
        stack: expect.stringContaining('TypeError: bad input'),
      });
    });

    it('follows the cause chain', () => {
      const root = new Error('connection refused');
      const wrapped = new Error('booking failed', { cause: root });

      const serialized = serializeError(wrapped) as { cause: { name: string; message: string } };

      expect(serialized.cause.name).toBe('Error');
      expect(serialized.cause.message).toBe('connection refused');
    });

    it('stringifies non-error causes', () => {
      const serialized = serializeError(new Error('outer', { cause: 'plain string' })) as {
        cause: string;
      };
      expect(serialized.cause).toBe('plain string');
    });

    it('keeps own enumerable extras and redacts secret ones', () => {
      const error = Object.assign(new Error('provider down'), {
        statusCode: 503,
        apiKey: 'super-secret',
      });

      expect(serializeError(error)).toMatchObject({
        statusCode: 503,
        apiKey: REDACTED,
      });
    });

    it('returns null for non-error values', () => {
      expect(serializeError('not an error')).toBeNull();
      expect(serializeError(undefined)).toBeNull();
      expect(serializeError({ message: 'has message' })).toBeNull();
    });

    it('is applied by redactValue so `error` fields survive logging', () => {
      const result = redactValue({ error: new RangeError('out of range') }) as {
        error: { name: string; message: string };
      };

      expect(result.error.name).toBe('RangeError');
      expect(result.error.message).toBe('out of range');
    });
  });

  describe('safeStringify', () => {
    it('serialises ordinary payloads', () => {
      expect(safeStringify({ a: 1 })).toBe('{"a":1}');
    });

    it('never throws on a circular payload', () => {
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;

      expect(() => safeStringify(cyclic)).not.toThrow();
      expect(safeStringify(cyclic)).toContain(CIRCULAR);
    });

    it('never throws on a BigInt payload', () => {
      expect(() => safeStringify({ big: 1n })).not.toThrow();
      expect(safeStringify({ big: 1n })).toContain('1n');
    });

    it('returns a marker for values that cannot be represented', () => {
      expect(safeStringify(undefined)).toBe('{"serializationError":"unserializable log payload"}');
    });
  });

  describe('resolveLogFormat', () => {
    it('defaults to pretty in development', () => {
      expect(resolveLogFormat({ NODE_ENV: 'development' })).toBe('pretty');
    });

    it('defaults to json everywhere else', () => {
      expect(resolveLogFormat({ NODE_ENV: 'staging' })).toBe('json');
      expect(resolveLogFormat({ NODE_ENV: 'production' })).toBe('json');
      expect(resolveLogFormat({ NODE_ENV: 'test' })).toBe('json');
    });

    it('lets LOG_FORMAT override the NODE_ENV default', () => {
      expect(resolveLogFormat({ NODE_ENV: 'development', LOG_FORMAT: 'json' })).toBe('json');
      expect(resolveLogFormat({ NODE_ENV: 'production', LOG_FORMAT: 'pretty' })).toBe('pretty');
    });

    it('ignores an unknown LOG_FORMAT value', () => {
      expect(resolveLogFormat({ NODE_ENV: 'production', LOG_FORMAT: 'yaml' })).toBe('json');
    });

    it('exposes a boolean helper for the transports', () => {
      expect(isJsonFormat({ NODE_ENV: 'staging' })).toBe(true);
      expect(isJsonFormat({ NODE_ENV: 'development' })).toBe(false);
    });
  });

  describe('deriveEventName', () => {
    it('derives a stable machine-readable event from a message', () => {
      expect(deriveEventName('HTTP request completed')).toBe('http_request_completed');
      expect(deriveEventName('http_request')).toBe('http_request');
      expect(deriveEventName('Booking failed! (retry 2)')).toBe('booking_failed_retry_2');
    });

    it('falls back to `log` for empty or non-string messages', () => {
      expect(deriveEventName('')).toBe('log');
      expect(deriveEventName(undefined)).toBe('log');
      expect(deriveEventName(42)).toBe('log');
      expect(deriveEventName('***')).toBe('log');
    });

    it('caps the event name length', () => {
      expect(deriveEventName('a'.repeat(200)).length).toBeLessThanOrEqual(64);
    });
  });
});

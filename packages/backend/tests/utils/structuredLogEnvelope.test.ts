import { Writable } from 'stream';
import winston from 'winston';
import { LOG_ENVELOPE_KEYS, REDACTED } from '../../src/utils/structuredLogger';
import { logger, asyncLocalStorage } from '../../src/utils/logger';

interface CapturedLogs {
  lines: string[];
  transport: winston.transport;
  records: () => Record<string, unknown>[];
}

/**
 * Attach an in-memory transport to the shared logger so the real format chain
 * (correlation → timestamp → event → redaction → JSON) is exercised end to end.
 */
function captureLogs(target: winston.Logger = logger): CapturedLogs {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString().trim());
      callback();
    },
  });

  target.level = 'debug';
  const transport = new winston.transports.Stream({ stream, level: 'debug' });
  target.add(transport);

  return {
    lines,
    transport,
    records: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('structured JSON log output (issue #738)', () => {
  const captured: CapturedLogs[] = [];

  afterEach(() => {
    while (captured.length > 0) {
      const cap = captured.pop();
      if (cap) logger.remove(cap.transport);
    }
  });

  function startCapture(): CapturedLogs {
    const cap = captureLogs();
    captured.push(cap);
    return cap;
  }

  it('emits the documented envelope on a single line of JSON', () => {
    const cap = startCapture();

    logger.info('Booking confirmed', { bookingId: 'bk-1', amountCents: 4200 });

    const [record, ...rest] = cap.records();
    for (const key of LOG_ENVELOPE_KEYS) {
      expect(record).toHaveProperty(key);
    }
    expect(record.level).toBe('info');
    expect(record.message).toBe('Booking confirmed');
    expect(record.service).toBe('traqora-api');
    expect(record.event).toBe('booking_confirmed');
    expect(record.bookingId).toBe('bk-1');
    expect(record.amountCents).toBe(4200);
    expect(typeof record.timestamp).toBe('string');
    expect(rest).toHaveLength(0);
  });

  it('preserves a caller-supplied event name', () => {
    const cap = startCapture();

    logger.info('Booking confirmed', { event: 'booking.confirmed.v2' });

    expect(cap.records()[0].event).toBe('booking.confirmed.v2');
  });

  it('injects correlationId and requestId from the request context', () => {
    const cap = startCapture();
    const store = new Map<string, string>([
      ['correlationId', 'corr-123'],
      ['requestId', 'req-456'],
    ]);

    asyncLocalStorage.run(store, () => {
      logger.info('Refund queued', { refundId: 'rf-1' });
    });

    const record = cap.records()[0];
    expect(record.correlationId).toBe('corr-123');
    expect(record.requestId).toBe('req-456');
    expect(record.refundId).toBe('rf-1');
  });

  it('redacts secrets anywhere in the payload', () => {
    const cap = startCapture();

    logger.info('Upstream call', {
      headers: { authorization: 'Bearer super-secret', accept: 'application/json' },
      body: { password: 'hunter2', nested: [{ refresh_token: 'r-1' }] },
    });

    const record = cap.records()[0];
    expect(record.headers).toEqual({ authorization: REDACTED, accept: 'application/json' });
    expect(record.body).toEqual({ password: REDACTED, nested: [{ refresh_token: REDACTED }] });
    expect(cap.lines[0]).not.toContain('super-secret');
    expect(cap.lines[0]).not.toContain('hunter2');
  });

  it('keeps the error detail of a logged exception', () => {
    const cap = startCapture();

    logger.error('Payment capture failed', { error: new Error('card declined') });

    const record = cap.records()[0] as { error: { message: string; stack: string } };
    expect(record.level).toBe('error');
    expect(record.error.message).toBe('card declined');
    expect(record.error.stack).toContain('Error: card declined');
  });

  describe('failure modes — the logger must never throw', () => {
    it('accepts a circular payload', () => {
      const cap = startCapture();
      const cyclic: Record<string, unknown> = { flight: 'TQ101' };
      cyclic.self = cyclic;

      expect(() => logger.info('Cyclic payload', { payload: cyclic })).not.toThrow();

      const record = cap.records()[0] as { payload: Record<string, unknown> };
      expect(record.payload.flight).toBe('TQ101');
      expect(record.payload.self).toBe('[Circular]');
    });

    it('accepts a BigInt, a Map and a Set', () => {
      const cap = startCapture();

      expect(() =>
        logger.info('Exotic payload', {
          big: 12345678901234567890n,
          map: new Map([['a', 1]]),
          set: new Set(['x']),
        }),
      ).not.toThrow();

      const record = cap.records()[0] as { big: string; map: unknown; set: unknown };
      expect(record.big).toBe('12345678901234567890n');
      expect(record.map).toEqual({ a: 1 });
      expect(record.set).toEqual(['x']);
    });

    it('accepts a payload containing a getter that throws', () => {
      const cap = startCapture();
      const hostile = {
        ok: 'value',
        get boom(): unknown {
          throw new Error('getter exploded');
        },
      };

      expect(() => logger.warn('Hostile payload', { hostile })).not.toThrow();
      expect(cap.records()[0]).toMatchObject({ hostile: { ok: 'value' } });
    });
  });

  it('shares one request context with the LoggerService facade', () => {
    // Two private AsyncLocalStorage instances previously meant correlationId
    // vanished from every LoggerService log line.
    const serviceLogger = require('../../src/services/logger');
    expect(serviceLogger.asyncLocalStorage).toBe(asyncLocalStorage);
  });

  it('emits JSON on stdout when LOG_FORMAT=json outside development', () => {
    jest.isolateModules(() => {
      process.env.LOG_FORMAT = 'json';
      process.env.NODE_ENV = 'development';
      const isolated = require('../../src/utils/logger');
      const cap = captureLogs(isolated.logger as typeof logger);

      isolated.logger.info('Forced JSON', { event: 'forced_json' });

      const parsed = cap.records()[0];
      expect(parsed.event).toBe('forced_json');
      expect(parsed.message).toBe('Forced JSON');
      delete process.env.LOG_FORMAT;
    });
  });
});

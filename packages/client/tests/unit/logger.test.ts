import { ClientLogger, getLogger } from '../../lib/logger';

describe('ClientLogger', () => {
  let logger: ClientLogger;

  beforeEach(() => {
    logger = new ClientLogger('test-component', { service: 'unit-test' });
    console.debug = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  describe('constructor', () => {
    it('should create logger with component name', () => {
      const l = new ClientLogger('my-component');
      expect(l).toBeInstanceOf(ClientLogger);
    });

    it('should create logger with default context', () => {
      const l = new ClientLogger('ctx', { userId: '123' });
      expect(l).toBeDefined();
    });
  });

  describe('logging methods', () => {
    it('should log debug', () => {
      logger.debug('debug message');
      expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('debug message'));
    });

    it('should log info', () => {
      logger.info('info message');
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('info message'));
    });

    it('should log warn', () => {
      logger.warn('warn message');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('warn message'));
    });

    it('should log error', () => {
      logger.error('error message');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('error message'));
    });

    it('should include metadata in output', () => {
      logger.info('with meta', { action: 'test' });
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('test'));
    });
  });

  describe('child', () => {
    it('should create child with merged context', () => {
      const child = logger.child({ subComponent: 'inner' });
      child.info('child log');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('child log'),
      );
    });
  });

  describe('time', () => {
    it('should time synchronous function', () => {
      const result = logger.time('sync-op', () => 42);
      expect(result).toBe(42);
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('sync-op completed'),
      );
    });

    it('should time asynchronous function', async () => {
      const result = await logger.time('async-op', async () => 42);
      expect(result).toBe(42);
    });
  });

  describe('captureError', () => {
    it('should capture an Error instance', () => {
      logger.captureError(new Error('test error'));
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('test error'),
      );
    });

    it('should capture a string', () => {
      logger.captureError('string error');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('string error'),
      );
    });
  });

  describe('logAudit', () => {
    it('should log audit event', () => {
      logger.logAudit('UPDATE', 'order', 'ord-123');
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Audit: UPDATE on order'),
      );
    });
  });

  describe('sanitization', () => {
    it('should redact sensitive keys in metadata', () => {
      logger.info('with sensitive data', {
        password: 'secret123',
        token: 'abc',
        email: 'test@test.com',
      });
      const call = (console.info as jest.Mock).mock.calls[0][0];
      expect(call).toContain('[REDACTED]');
      expect(call).not.toContain('secret123');
      expect(call).not.toContain('abc');
    });
  });
});

describe('getLogger', () => {
  it('should return singleton per component', () => {
    const a = getLogger('shared');
    const b = getLogger('shared');
    expect(a).toBe(b);
  });

  it('should create separate instances for different components', () => {
    const a = getLogger('comp-a');
    const b = getLogger('comp-b');
    expect(a).not.toBe(b);
  });
});

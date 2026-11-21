import { LoggerService, getLogger, asyncLocalStorage } from '../logger';

describe('LoggerService', () => {
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService({ component: 'test' });
  });

  describe('basic logging', () => {
    it('should create logger with default context', () => {
      expect(logger).toBeDefined();
    });

    it('should create child logger with merged context', () => {
      const child = logger.child({ subComponent: 'unit' });
      expect(child).toBeInstanceOf(LoggerService);
    });

    it('should log at debug level', () => {
      expect(() => logger.debug('debug message')).not.toThrow();
    });

    it('should log at info level', () => {
      expect(() => logger.info('info message')).not.toThrow();
    });

    it('should log at warn level', () => {
      expect(() => logger.warn('warn message')).not.toThrow();
    });

    it('should log at error level', () => {
      expect(() => logger.error('error message')).not.toThrow();
    });

    it('should log with metadata', () => {
      expect(() => logger.info('with metadata', { userId: '123', action: 'test' })).not.toThrow();
    });
  });

  describe('log level method', () => {
    it('should accept dynamic log level', () => {
      expect(() => logger.log('info', 'dynamic level')).not.toThrow();
      expect(() => logger.log('error', 'error level')).not.toThrow();
    });
  });

  describe('time method', () => {
    it('should time synchronous function', () => {
      const result = logger.time('sync-op', () => 42);
      expect(result).toBe(42);
    });

    it('should time async function', async () => {
      const result = await logger.time('async-op', async () => 42);
      expect(result).toBe(42);
    });
  });

  describe('getLogger singleton', () => {
    it('should return same instance without context', () => {
      const a = getLogger();
      const b = getLogger();
      expect(a).toBe(b);
    });

    it('should return child with context', () => {
      const child = getLogger({ component: 'child' });
      expect(child).toBeInstanceOf(LoggerService);
    });
  });

  describe('context propagation', () => {
    it('should propagate context via AsyncLocalStorage', () => {
      const store = new Map<string, string>();
      store.set('correlationId', 'test-corr-id');
      store.set('userId', 'user-123');

      asyncLocalStorage.run(store, () => {
        expect(() => logger.info('contextual log')).not.toThrow();
      });
    });
  });
});

import { DbVacuumService } from '../db-vacuum.service';
import * as postgresModule from '../../db/postgres';

jest.mock('../../db/postgres', () => ({
  getPostgresPool: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('DbVacuumService', () => {
  let service: DbVacuumService;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = DbVacuumService.getInstance();
    mockPool = {
      query: jest.fn(),
    };
    (postgresModule.getPostgresPool as jest.Mock).mockReturnValue(mockPool);
  });

  it('should successfully vacuum all public tables when no table names are specified', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ tablename: 'flights' }, { tablename: 'bookings' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.vacuumIndexes();

    expect(result.success).toBe(true);
    expect(result.tablesProcessed).toEqual(['flights', 'bookings']);
    expect(mockPool.query).toHaveBeenCalledTimes(3);
    expect(mockPool.query).toHaveBeenCalledWith('VACUUM (ANALYZE) flights');
    expect(mockPool.query).toHaveBeenCalledWith('VACUUM (ANALYZE) bookings');
  });

  it('should vacuum specified tables with custom options', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const result = await service.vacuumIndexes({
      tableNames: ['users'],
      full: true,
      analyze: true,
      verbose: true,
    });

    expect(result.success).toBe(true);
    expect(result.tablesProcessed).toEqual(['users']);
    expect(mockPool.query).toHaveBeenCalledWith('VACUUM (FULL ANALYZE VERBOSE) users');
  });

  it('should return failure result when invalid table name is provided', async () => {
    const result = await service.vacuumIndexes({
      tableNames: ['invalid-table-name; DROP TABLE users;'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Potentially unsafe table name');
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('should return failure result when Postgres pool is uninitialized', async () => {
    (postgresModule.getPostgresPool as jest.Mock).mockReturnValue(null);

    const result = await service.vacuumIndexes();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Postgres pool is not initialized or available');
  });

  it('should handle query execution failure gracefully', async () => {
    mockPool.query.mockRejectedValue(new Error('Connection lost'));

    const result = await service.vacuumIndexes({ tableNames: ['flights'] });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection lost');
    expect(result.tablesProcessed).toEqual([]);
  });
});

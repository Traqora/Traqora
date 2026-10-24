import { getPostgresPool } from '../db/postgres';
import { logger } from '../utils/logger';
import { VacuumOptions, VacuumResult, validateVacuumOptions } from '../utils/db-vacuum';

export class DbVacuumService {
  private static instance: DbVacuumService;

  private constructor() {}

  public static getInstance(): DbVacuumService {
    if (!DbVacuumService.instance) {
      DbVacuumService.instance = new DbVacuumService();
    }
    return DbVacuumService.instance;
  }

  public async vacuumIndexes(options?: VacuumOptions): Promise<VacuumResult> {
    const startTime = Date.now();
    const tablesProcessed: string[] = [];

    try {
      validateVacuumOptions(options);

      const pool = getPostgresPool();
      if (!pool || typeof pool.query !== 'function') {
        throw new Error('Postgres pool is not initialized or available');
      }

      let tables = options?.tableNames;
      if (!tables || tables.length === 0) {
        const res = await pool.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        );
        tables = res.rows.map((r: any) => r.tablename);
      }

      const fullFlag = options?.full ? 'FULL' : '';
      const analyzeFlag = options?.analyze !== false ? 'ANALYZE' : '';
      const verboseFlag = options?.verbose ? 'VERBOSE' : '';

      const flags = [fullFlag, analyzeFlag, verboseFlag].filter(Boolean).join(' ');
      const clause = flags ? `(${flags})` : '';

      for (const table of tables!) {
        const query = `VACUUM ${clause} ${table}`;
        logger.info(`Executing vacuum command: ${query}`);
        await pool.query(query);
        tablesProcessed.push(table);
      }

      return {
        success: true,
        tablesProcessed,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      logger.error('Failed to vacuum database indexes', { error: err.message });
      return {
        success: false,
        tablesProcessed,
        durationMs: Date.now() - startTime,
        error: err.message,
      };
    }
  }
}

export const dbVacuumService = DbVacuumService.getInstance();

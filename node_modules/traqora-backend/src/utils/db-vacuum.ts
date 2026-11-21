/**
 * Contract definition and types for Postgres index vacuuming.
 */

export interface VacuumOptions {
  tableNames?: string[];
  full?: boolean;
  analyze?: boolean;
  verbose?: boolean;
}

export interface VacuumResult {
  success: boolean;
  tablesProcessed: string[];
  durationMs: number;
  error?: string;
}

export function validateVacuumOptions(options?: VacuumOptions): void {
  if (options?.tableNames) {
    for (const name of options.tableNames) {
      if (typeof name !== 'string' || name.trim() === '') {
        throw new Error('Invalid table name provided for vacuuming');
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        throw new Error(`Potentially unsafe table name: ${name}`);
      }
    }
  }
}

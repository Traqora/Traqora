# Postgres Index and Table Vacuuming

Traqora includes an automated and programmatic utility (`DbVacuumService`) for maintaining PostgreSQL database performance by vacuuming indexes and tables.

## Overview

Over time, database updates and deletions can cause bloat in tables and indexes. Regular vacuuming reclaims storage and updates planner statistics via `ANALYZE`.

## API Contract (`VacuumOptions`)

```typescript
export interface VacuumOptions {
  tableNames?: string[];
  full?: boolean;
  analyze?: boolean;
  verbose?: boolean;
}
```

### Parameters
- `tableNames`: Optional array of specific table names to vacuum. If omitted or empty, all public tables are discovered and vacuumed.
- `full`: Performs a `VACUUM FULL`, which reclaims disk space by writing a complete new copy of the table (requires exclusive table locks).
- `analyze`: Defaults to `true`. Updates statistics used by the query planner.
- `verbose`: Emits detailed progress messages during vacuuming.

## Security & Input Validation

To prevent SQL injection, all table names provided in `tableNames` are strictly validated against an alphanumeric and underscore pattern (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`). Unsafe names throw an error immediately.

## Example Usage

```typescript
import { dbVacuumService } from '../packages/backend/src/services/db-vacuum.service';

async function performMaintenance() {
  const result = await dbVacuumService.vacuumIndexes({
    tableNames: ['flights', 'bookings'],
    analyze: true,
  });

  if (result.success) {
    console.log(`Vacuum completed successfully in ${result.durationMs}ms`);
  } else {
    console.error(`Vacuum failed: ${result.error}`);
  }
}
```

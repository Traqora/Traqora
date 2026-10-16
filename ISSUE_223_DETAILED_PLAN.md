# Issue #223: Database Query Optimization - Detailed Plan

## Objective
Improve database query performance and scalability through indexing, query optimization, and connection pooling.

## Priority: Medium | Type: Performance | Estimated Duration: 2-3 weeks

---

## Phase 1: Current State Analysis

### 1.1 Query Performance Audit
- **Analyze current queries** in:
  - `flightRepository.ts` - search, filtering, sorting
  - `bookingOrchestrationService.ts` - booking creation, retrieval
  - `flightSearchService.ts` - search with filters
  - Admin analytics routes

- **Tools to use:**
  - PostgreSQL EXPLAIN ANALYZE for query plans
  - Application Performance Monitoring (APM) logs
  - Database slow query logs

### 1.2 Identify Performance Bottlenecks

**Potential N+1 Query Issues:**
```
1. Booking retrieval with Flight and Passenger relations
2. Flight search returning large result sets
3. Admin analytics queries on large tables
4. Price history queries with aggregations
5. Refund processing with booking lookups
```

**Expected Findings:**
- Missing indexes on frequently filtered columns
- Eager loading causing unnecessary data transfer
- Unoptimized JOIN operations
- Missing connection pooling

---

## Phase 2: Index Implementation

### 2.1 Create Migration File
**File:** `packages/backend/src/db/migrations/1750001000000-AddMissingIndexes.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingIndexes1750001000000 implements MigrationInterface {
  name = 'AddMissingIndexes1750001000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Flight table indexes
    await queryRunner.query(
      `CREATE INDEX idx_flights_departure_time_airport ON flights(departureTime, fromAirport, toAirport)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_flights_status_updated ON flights(status, updatedAt)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_flights_sync_status ON flights(syncStatus, lastSyncedAt)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_flights_airline_code ON flights(airlineCode)`
    );

    // Booking table indexes
    await queryRunner.query(
      `CREATE INDEX idx_bookings_passenger_status ON bookings(passenger_id, status)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_bookings_flight_status ON bookings(flight_id, status)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_bookings_created_status ON bookings(createdAt, status)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_bookings_soroban_tx ON bookings(sorobanTxHash)`
    );

    // Refund table indexes
    await queryRunner.query(
      `CREATE INDEX idx_refunds_booking_status ON refunds(booking_id, status)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_refunds_updated ON refunds(updatedAt)`
    );

    // User table indexes
    await queryRunner.query(
      `CREATE INDEX idx_users_email ON users(email)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_users_created ON users(createdAt)`
    );

    // Admin audit indexes
    await queryRunner.query(
      `CREATE INDEX idx_admin_audit_created ON admin_audit_logs(createdAt, action)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_admin_audit_admin ON admin_audit_logs(admin_id, createdAt)`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all indexes
    await queryRunner.query(`DROP INDEX idx_flights_departure_time_airport`);
    await queryRunner.query(`DROP INDEX idx_flights_status_updated`);
    await queryRunner.query(`DROP INDEX idx_flights_sync_status`);
    await queryRunner.query(`DROP INDEX idx_flights_airline_code`);
    await queryRunner.query(`DROP INDEX idx_bookings_passenger_status`);
    await queryRunner.query(`DROP INDEX idx_bookings_flight_status`);
    await queryRunner.query(`DROP INDEX idx_bookings_created_status`);
    await queryRunner.query(`DROP INDEX idx_bookings_soroban_tx`);
    await queryRunner.query(`DROP INDEX idx_refunds_booking_status`);
    await queryRunner.query(`DROP INDEX idx_refunds_updated`);
    await queryRunner.query(`DROP INDEX idx_users_email`);
    await queryRunner.query(`DROP INDEX idx_users_created`);
    await queryRunner.query(`DROP INDEX idx_admin_audit_created`);
    await queryRunner.query(`DROP INDEX idx_admin_audit_admin`);
  }
}
```

---

## Phase 3: Query Optimization

### 3.1 Flight Repository Optimization
**File:** `packages/backend/src/repositories/flightRepository.ts`

**Example - Search Flights:**
```typescript
// BEFORE (N+1 pattern, loads all relations)
async searchFlights(params: SearchParams) {
  return this.find({
    relations: ['priceHistory', 'statusHistory'],
    where: {
      fromAirport: params.from,
      toAirport: params.to,
      status: 'SCHEDULED'
    }
  });
}

// AFTER (Optimized query builder)
async searchFlights(params: SearchParams) {
  return this.createQueryBuilder('flight')
    .leftJoinAndSelect(
      'flight.priceHistory',
      'priceHistory',
      'priceHistory.createdAt = (SELECT MAX(ph.createdAt) FROM price_history ph WHERE ph.flight_id = flight.id)'
    )
    .where('flight.fromAirport = :from', { from: params.from })
    .andWhere('flight.toAirport = :to', { to: params.to })
    .andWhere('flight.departureTime BETWEEN :start AND :end', {
      start: params.startDate,
      end: params.endDate
    })
    .andWhere('flight.status = :status', { status: 'SCHEDULED' })
    .orderBy('flight.departureTime', 'ASC')
    .addOrderBy('flight.priceCents', 'ASC')
    .select([
      'flight.id',
      'flight.flightNumber',
      'flight.fromAirport',
      'flight.toAirport',
      'flight.departureTime',
      'flight.arrivalTime',
      'flight.seatsAvailable',
      'flight.priceCents',
      'flight.status',
      'priceHistory.id',
      'priceHistory.priceCents',
      'priceHistory.createdAt'
    ])
    .getMany();
}
```

### 3.2 Booking Service Optimization
**File:** `packages/backend/src/services/bookingOrchestrationService.ts`

```typescript
// BEFORE (Loads entire objects)
const booking = await bookingRepo.findOne({
  where: { id: bookingId },
  relations: ['flight', 'passenger', 'refund']
});

// AFTER (Query builder with select)
const booking = await bookingRepo
  .createQueryBuilder('booking')
  .leftJoinAndSelect('booking.flight', 'flight')
  .leftJoinAndSelect('booking.passenger', 'passenger')
  .where('booking.id = :id', { id: bookingId })
  .select([
    'booking.id',
    'booking.status',
    'booking.amountCents',
    'booking.sorobanTxHash',
    'flight.id',
    'flight.flightNumber',
    'flight.departureTime',
    'passenger.email',
    'passenger.firstName'
  ])
  .getOne();
```

### 3.3 Batch Operations
```typescript
// For bulk operations, use batch processing
async processBookingBatch(bookingIds: string[], batchSize: number = 100) {
  for (let i = 0; i < bookingIds.length; i += batchSize) {
    const batch = bookingIds.slice(i, i + batchSize);
    
    const bookings = await this.bookingRepo
      .createQueryBuilder('booking')
      .where('booking.id IN (:...ids)', { ids: batch })
      .getMany();
    
    // Process batch
    await this.processBatch(bookings);
  }
}
```

---

## Phase 4: Connection Pooling

### 4.1 Update Database Configuration
**File:** `packages/backend/src/db/dataSource.ts`

```typescript
const poolConfig = {
  max: 20,                        // Maximum connections
  min: 5,                         // Minimum connections
  idleTimeoutMillis: 30000,       // 30 seconds idle timeout
  connectionTimeoutMillis: 2000,  // 2 second connection timeout
  allowExitOnIdle: false,
};

export const AppDataSource = new DataSource({
  type: "postgres",
  url: config.databaseUrl,
  synchronize: false,
  logging: config.environment === 'development',
  entities: [/* entities */],
  migrations: [__dirname + "/migrations/*.{js,ts}"],
  ssl: config.environment === "production" ? { rejectUnauthorized: false } : false,
  extra: poolConfig,
  maxQueryExecutionTime: 1000, // Log queries taking > 1s
});
```

### 4.2 Add Database Health Check
**File:** `packages/backend/src/utils/health-check.ts`

```typescript
export async function checkDatabaseHealth(): Promise<HealthStatus> {
  try {
    const startTime = Date.now();
    
    // Simple query to check connection
    await AppDataSource.query('SELECT 1');
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'healthy',
      responseTime,
      poolStats: {
        size: AppDataSource.manager.connection.pool?.idleCount || 0,
        activeConnections: AppDataSource.manager.connection.pool?.waitingCount || 0
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}
```

---

## Phase 5: Query Caching (Optional Enhancement)

### 5.1 Redis Cache Integration
```typescript
// Add to frequently queried items
async getFlightWithCache(flightId: string) {
  const cacheKey = `flight:${flightId}`;
  
  // Try cache first
  const cached = await redisClient.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Query database
  const flight = await flightRepo
    .createQueryBuilder('flight')
    .where('flight.id = :id', { id: flightId })
    .getOne();
  
  // Cache for 5 minutes
  if (flight) {
    await redisClient.setex(cacheKey, 300, JSON.stringify(flight));
  }
  
  return flight;
}
```

---

## Testing Strategy

### Test Cases
1. **Performance Benchmarks**
   - Measure query time before/after indexes
   - Compare with and without pooling
   - Load test with concurrent connections

2. **Index Coverage**
   - Verify indexes are used (EXPLAIN ANALYZE)
   - Check index size growth
   - Monitor unused indexes

3. **Connection Pool**
   - Test with varying concurrent loads
   - Verify idle timeout behavior
   - Monitor connection limits

### Validation Queries
```sql
-- Check if index is being used
EXPLAIN ANALYZE SELECT * FROM flights 
WHERE fromAirport = 'NYC' 
AND departureTime > NOW();

-- Check index size
SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) 
FROM pg_indexes 
WHERE schemaname = 'public';

-- View connection pool status
SELECT count(*) FROM pg_stat_activity;
```

---

## Rollback Plan

1. **Revert Migration**
   ```bash
   npm run migration:revert
   ```

2. **Monitor After Revert**
   - Check query performance returns to baseline
   - Verify no data loss

---

## Success Metrics

- ✅ Index creation reduces query time by 50%+
- ✅ Connection pool reduces connection overhead
- ✅ No N+1 queries in critical paths
- ✅ Database health check passes
- ✅ All tests pass
- ✅ Load testing shows improved throughput

---

## Related Issues
- Improves performance for #208 (Multi-City Booking)
- Supports #209 (Real-Time Updates) with better query performance

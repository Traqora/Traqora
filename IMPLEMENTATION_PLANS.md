# Traqora Issue Implementation Plans

## Project Context
- **Type**: Decentralized travel booking platform on Stellar blockchain
- **Stack**: Express.js (TypeORM, PostgreSQL), Next.js, Socket.io, Soroban smart contracts
- **Key Features**: Flight booking, smart contracts, refunds, loyalty programs
- **Architecture**: Monorepo with backend, client, and contracts packages

## Database & Tech Foundation Notes
- Uses TypeORM with PostgreSQL for production (SQLite for tests)
- Existing WebSocket infrastructure via Socket.io with Redis adapter support
- Validation using Zod schema
- JWT authentication middleware
- Idempotency key pattern already implemented for bookings
- Redis for WebSocket Redis adapter (optional, fallback to in-memory)
- Existing migration system in place at `src/db/migrations/`

---

# Issue #223: Add Database Query Optimization (Medium Priority - Performance)

## Overview
Improve database query performance through indexing, query optimization, and connection pooling.

## Implementation Plan

### Phase 1: Query Performance Analysis
**Files to create/modify:**
- `packages/backend/src/db/analysis/queryAnalysis.ts` (new)
- `packages/backend/src/db/analysis/index-strategy.md` (new)

**Tasks:**
1. Analyze current queries in key repositories:
   - `flightRepository.ts` - search, filter by date, airport
   - `bookingOrchestrationService.ts` - booking queries
   - Flight-related aggregations

2. Identify N+1 query patterns:
   - Bookings with eager-loaded Flight and Passenger
   - Refunds with related bookings
   - Flight search with price history

3. Create query performance report

### Phase 2: Add Missing Indexes
**Files to create:**
- `packages/backend/src/db/migrations/1750001000000-AddMissingIndexes.ts` (new)

**Indexes to add:**
```sql
-- Flight table optimizations
CREATE INDEX idx_flights_departure_time_airport ON flights(departureTime, fromAirport, toAirport);
CREATE INDEX idx_flights_status_updated ON flights(status, updatedAt);
CREATE INDEX idx_flights_sync_status ON flights(syncStatus, lastSyncedAt);

-- Booking table optimizations  
CREATE INDEX idx_bookings_passenger_status ON bookings(passenger_id, status);
CREATE INDEX idx_bookings_flight_status ON bookings(flight_id, status);
CREATE INDEX idx_bookings_created_status ON bookings(createdAt, status);

-- Refund table optimizations
CREATE INDEX idx_refunds_booking_status ON refunds(booking_id, status);
CREATE INDEX idx_refunds_updated ON refunds(updatedAt);

-- User & Admin tables
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_admin_audit_created ON admin_audit_logs(createdAt, action);
```

### Phase 3: Optimize N+1 Queries
**Files to modify:**
- `packages/backend/src/services/bookingOrchestrationService.ts`
- `packages/backend/src/services/flightSearchService.ts`
- `packages/backend/src/api/routes/bookings.ts`
- `packages/backend/src/api/routes/flights.ts`

**Approach:**
1. Replace eager loading with explicit `.leftJoinAndSelect()` in queries
2. Use `.relation()` for lazy loading when needed
3. Batch queries for bulk operations
4. Add query result caching for expensive operations

Example optimization:
```typescript
// Before (N+1)
const bookings = await bookingRepo.find({ relations: ['flight', 'passenger'] });

// After (Query builder)
const bookings = await bookingRepo
  .createQueryBuilder('booking')
  .leftJoinAndSelect('booking.flight', 'flight')
  .leftJoinAndSelect('booking.passenger', 'passenger')
  .where('booking.status = :status', { status: 'confirmed' })
  .select(['booking', 'flight.id', 'flight.flightNumber', 'passenger.email'])
  .getMany();
```

### Phase 4: Connection Pooling Optimization
**Files to modify:**
- `packages/backend/src/db/dataSource.ts`
- `packages/backend/src/config/index.ts` (add pooling config)

**Implementation:**
1. Update dataSource configuration:
```typescript
{
  type: "postgres",
  url: config.databaseUrl,
  // Add connection pooling
  extra: {
    max: 20, // max connections
    min: 5,  // min connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
}
```

2. Add database health check endpoint for monitoring

### Deliverables
- Migration file with indexes
- Updated repositories with optimized queries
- Database configuration updates
- Performance documentation

---

# Issue #209: Add Real-Time Flight Status Updates (High Priority - Feature)

## Overview
Real-time notifications for flight status changes (delays, gate changes, cancellations) via WebSocket.

## Implementation Plan

### Phase 1: Flight Status Tracking Service
**Files to create:**
- `packages/backend/src/services/flight-status.ts` (new)
- `packages/backend/src/jobs/flight-status-sync.ts` (new)

**Flight Status Service:**
```typescript
// Handle status updates: SCHEDULED, DELAYED, BOARDING, LANDED, CANCELLED
// Track: delayMinutes, gate, terminal, cancellationReason
// Broadcast via WebSocket to subscribed clients
```

**Implementation details:**
1. Add status change detection logic
2. Create job to periodically sync flight status from external APIs (Amadeus)
3. Emit WebSocket events when changes detected
4. Store historical status changes

### Phase 2: WebSocket Event System
**Files to modify:**
- `packages/backend/src/websockets/server.ts` (extend)

**New WebSocket events:**
```typescript
// Server → Client
flightStatusChange: (data: {
  flightId: string;
  previousStatus: string;
  newStatus: string;
  delayMinutes?: number;
  gate?: string;
  terminal?: string;
  timestamp: Date;
}) => void;

// Client → Server
subscribeFlight: (flightId: string) => void;
unsubscribeFlight: (flightId: string) => void;
```

**Tasks:**
1. Add flight status subscription logic to WebSocket server
2. Create room/namespace for each flight: `/flights/{flightId}`
3. Handle subscriptions with idempotency (prevent duplicate subscriptions)
4. Implement user-based access control (only show relevant flights)

### Phase 3: Client Hook for Flight Status
**Files to create:**
- `packages/client/hooks/use-flight-status.ts` (new)

**Hook implementation:**
```typescript
export function useFlightStatus(flightId: string) {
  const { socket, isConnected } = useSocket();
  const [status, setStatus] = useState<FlightStatus | null>(null);
  const [history, setHistory] = useState<StatusUpdate[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Subscribe to flight status
  // Handle status change events
  // Track history
  // Notify user of significant changes
  return { status, history, isSubscribed };
}
```

### Phase 4: Push Notifications
**Files to modify:**
- `packages/backend/src/services/PushNotificationService.ts` (extend)
- `packages/backend/src/services/flight-status.ts` (add notifications)

**Implementation:**
1. Send push notifications for:
   - Flight delays > 15 minutes
   - Gate changes
   - Flight cancellations
2. Use Firebase Cloud Messaging or similar
3. Respect user notification preferences
4. Include deep link to flight details

### Phase 5: Historical Tracking
**Files to create:**
- `packages/backend/src/db/entities/FlightStatusHistory.ts` (new)
- `packages/backend/src/db/migrations/1750002000000-CreateFlightStatusHistory.ts` (new)

**Entity:**
```typescript
@Entity({ name: 'flight_status_history' })
export class FlightStatusHistory {
  flightId: string;
  previousStatus: string;
  newStatus: string;
  delayMinutes?: number;
  gate?: string;
  terminal?: string;
  cancellationReason?: string;
  timestamp: Date;
  createdAt: Date;
}
```

### Phase 6: Flight Search UI Update
**Files to modify:**
- `packages/client/hooks/use-flight-search.ts` (extend)
- `packages/client/app/search/page.tsx` (or similar search page)

**Changes:**
1. Add real-time status indicator in flight cards
2. Show delay warnings
3. Gate/terminal info when available
4. Highlight cancelled flights

### Deliverables
- Flight status service
- Flight status sync job
- WebSocket event handlers
- Client hook for flight status
- Push notification integration
- Historical tracking with new entity
- Updated search UI

---

# Issue #221: Add Input Sanitization and Validation (High Priority - Security)

## Overview
Comprehensive server-side validation, output encoding, and injection prevention.

## Implementation Plan

### Phase 1: Server-Side Validation Middleware
**Files to create:**
- `packages/backend/src/middleware/validation.ts` (new, comprehensive version)
- `packages/backend/src/schemas/sanitization.ts` (new)

**Validation Middleware:**
1. Extend existing `validationMiddleware.ts` with:
   - String length limits
   - Pattern matching (emails, phone numbers, etc.)
   - Type coercion & strict checking
   - Nested object validation
   - Array validation with item limits

**Sanitization schemas:**
```typescript
// Passenger sanitization
export const passengerSanitizationSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  firstName: z.string().min(1).max(100).regex(/^[a-zA-Z\s'-]*$/),
  lastName: z.string().min(1).max(100).regex(/^[a-zA-Z\s'-]*$/),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  sorobanAddress: z.string().regex(/^G[A-Z0-9]{55}$/),
});

// Booking sanitization
export const bookingSanitizationSchema = z.object({
  flightId: z.string().uuid(),
  passenger: passengerSanitizationSchema,
});
```

2. Create global validation middleware that:
   - Validates all request bodies
   - Validates query parameters
   - Validates path parameters
   - Removes unknown fields (whitelist approach)

### Phase 2: SQL Injection Prevention
**Files to modify:**
- `packages/backend/src/repositories/flightRepository.ts`
- `packages/backend/src/services/flightSearchService.ts`
- All API route handlers

**Implementation:**
1. Audit all raw SQL queries (if any exist)
2. Ensure ALL queries use parameterized queries with TypeORM
3. Add query builder type safety
4. Create protected method that prevents raw SQL:

```typescript
// Example: Prevent raw queries
export class SafeQueryBuilder {
  static ensureParamQuery(query: string) {
    if (!query.includes(':param')) {
      throw new Error('Raw SQL detected, use parameterized queries');
    }
  }
}
```

5. Test with SQL injection payloads:
   - `'; DROP TABLE flights; --`
   - `" OR 1=1 --`

### Phase 3: NoSQL Injection Prevention
**Files to modify:**
- `packages/backend/src/services/amadeus/index.ts`
- Any MongoDB/Mongoose code (check loyalty service)

**Implementation:**
1. Sanitize all input before database queries
2. Use schema validation for all NoSQL operations
3. No dynamic key evaluation: `db[userInput]`
4. Use explicit query builders

### Phase 4: Output Encoding
**Files to create:**
- `packages/backend/src/utils/outputEncoder.ts` (new)

**Implementation:**
1. HTML entity encoding for XSS prevention:
```typescript
export const encodeHTML = (str: string): string => {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, m => map[m]);
};
```

2. Apply encoding in API responses:
   - User-generated content
   - Flight descriptions
   - Cancellation reasons
   - Error messages

3. JSON context encoding for API responses

### Phase 5: API Endpoint Validation
**Files to create:**
- `packages/backend/src/api/schemas/full-validation.ts` (comprehensive schemas)

**Scope:**
1. Auth endpoints (`/auth/challenge`, `/auth/verify`, etc.)
2. Booking endpoints (`POST /bookings`, `GET /bookings`, etc.)
3. Flight endpoints (`GET /flights/search`)
4. Refund endpoints (`POST /refunds/request`)
5. User endpoints (`GET /users/profile`, etc.)

**Each schema should validate:**
- Required fields
- Type correctness
- Length limits
- Format/pattern
- Business logic constraints

### Phase 6: Security Headers & CORS
**Files to modify:**
- `packages/backend/src/middleware/securityMiddleware.ts`
- `packages/backend/src/middleware/csp.ts`

**Headers to ensure:**
```typescript
// CSP for XSS
'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'"

// CORS strict
cors: {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true,
}

// X-Frame-Options for clickjacking
'X-Frame-Options': 'DENY'

// X-Content-Type-Options
'X-Content-Type-Options': 'nosniff'
```

### Phase 7: Input Rate Limiting by Type
**Files to modify:**
- `packages/backend/src/middleware/rate-limit.ts`

**Add specific limits:**
- Auth endpoints: 5 requests/hour per IP
- Search endpoints: 30 requests/minute per user
- Booking endpoints: 10 requests/minute per user
- File uploads: 5 requests/hour

### Phase 8: Logging & Monitoring
**Files to create:**
- `packages/backend/src/security/validation-audit.ts` (new)

**Track:**
1. Failed validations (log details for analysis)
2. Injection attempts
3. Suspicious patterns
4. Rate limit violations

### Deliverables
- Comprehensive validation middleware
- Sanitization schemas
- Output encoding utilities
- SQL/NoSQL injection tests
- Updated security headers
- Rate limiting enhancements
- Security audit logging

---

# Issue #208: Implement Multi-City Flight Booking (High Priority - Feature)

## Overview
Allow users to book multiple flight segments in a single transaction with combined pricing and refunds.

## Implementation Plan

### Phase 1: Database Schema Updates
**Files to create:**
- `packages/backend/src/db/entities/MultiCityBooking.ts` (new)
- `packages/backend/src/db/entities/BookingSegment.ts` (new)
- `packages/backend/src/db/migrations/1750003000000-CreateMultiCityBooking.ts` (new)

**MultiCityBooking Entity:**
```typescript
@Entity({ name: 'multi_city_bookings' })
export class MultiCityBooking {
  id: string; // UUID
  userId: string;
  totalPriceCents: number;
  segmentCount: number;
  status: BookingStatus;
  
  // Links to individual flight bookings (segments)
  segments: BookingSegment[];
  
  // Combined refund handling
  linkedRefundId?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

@Entity({ name: 'booking_segments' })
export class BookingSegment {
  id: string;
  multiCityBookingId: string;
  bookingId: string; // References individual Booking
  sequenceNumber: number; // Order of segments
  createdAt: Date;
}
```

### Phase 2: Repository & Service Layer
**Files to create:**
- `packages/backend/src/repositories/multiCityBookingRepository.ts` (new)
- `packages/backend/src/services/multi-city-booking.ts` (new)

**Multi-City Booking Service:**
```typescript
export class MultiCityBookingService {
  // Create multi-city booking from flight segments
  async createMultiCityBooking(
    userId: string,
    segments: Array<{ flightId: string; passenger: PassengerInfo }>
  ): Promise<MultiCityBooking>;

  // Calculate total price across all segments
  async calculateTotalPrice(segments: Flight[]): Promise<number>;

  // Validate segment compatibility (no overlapping times, same passenger, etc.)
  async validateSegments(segments: Flight[]): Promise<ValidationResult>;

  // Handle combined booking submission to blockchain
  async submitMultiCityBooking(bookingId: string, unsignedXdr: string): Promise<string>;

  // Process combined refunds
  async processMultiCityRefund(bookingId: string): Promise<void>;
}
```

### Phase 3: Smart Contract Support
**Files to create:**
- `packages/backend/src/services/multiCitySmartContract.ts` (new)

**Smart Contract Integration:**
1. Create Soroban contract method for linked bookings
2. Handle linked booking submission
3. Track segment dependencies for refunds
4. Ensure atomic transaction (all segments or none)

**Contract considerations:**
- Treat as single transaction on-chain
- Implement rollback if any segment fails
- Share refund pool across segments

### Phase 4: API Endpoints
**Files to modify/create:**
- `packages/backend/src/api/routes/bookings.ts` (extend)
- `packages/backend/src/api/schemas/multi-city.ts` (new)

**New endpoints:**
```typescript
POST /api/v1/bookings/multi-city
// Create multi-city booking
{
  segments: [
    { flightId: "...", passenger: { ... } },
    { flightId: "...", passenger: { ... } }
  ]
}
// Returns: multi-city booking with total price and segments

GET /api/v1/bookings/multi-city/{bookingId}
// Get multi-city booking details with all segments

GET /api/v1/bookings/multi-city/{bookingId}/segments
// List all segments of a multi-city booking

DELETE /api/v1/bookings/multi-city/{bookingId}
// Cancel entire multi-city booking
```

### Phase 5: Frontend Pages & Components
**Files to create:**
- `packages/client/app/book/multi-city/page.tsx` (new)
- `packages/client/components/multi-city-booking/SegmentForm.tsx` (new)
- `packages/client/components/multi-city-booking/SegmentList.tsx` (new)
- `packages/client/components/multi-city-booking/PriceSummary.tsx` (new)
- `packages/client/hooks/use-multi-city-booking.ts` (new)

**Multi-City Booking Page:**
1. Segment builder (add/remove flights)
2. Date and time validation UI
3. Passenger info forms (can reuse or simplify for multi-city)
4. Combined price calculation
5. Review all segments before booking
6. Smart contract confirmation

**UI Components:**
- Add flight segment (date picker, airports, etc.)
- Flight segment card (remove button, details)
- Price breakdown (per segment + total)
- Booking summary

### Phase 6: Combined Refund Logic
**Files to modify:**
- `packages/backend/src/services/refundService.ts` (extend)
- `packages/backend/src/api/routes/refunds.ts` (extend)

**Implementation:**
1. Create `MultiCityRefund` entity or extend Refund
2. Handle partial refunds (refund single segment or all)
3. Combine refund amounts
4. Track dependencies between segments

**Scenarios:**
- Refund entire booking → refund all segments
- Refund single segment → calculate remaining segments
- Partial refund policies per segment

### Phase 7: Validation & Business Logic
**Files to create:**
- `packages/backend/src/validators/multiCityValidator.ts` (new)

**Validations:**
1. Segments must have same passenger
2. No overlapping flights (connection times)
3. Minimum connection time (e.g., 2 hours)
4. Maximum booking span (e.g., 30 days)
5. Price calculations correct
6. All segments on same booking

### Phase 8: Client Hooks & State Management
**Files to create:**
- `packages/client/hooks/use-multi-city-booking.ts` (comprehensive)

**Hook functionality:**
```typescript
export function useMultiCityBooking() {
  const [segments, setSegments] = useState<FlightSegment[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Add/remove segments
  // Validate segments
  // Calculate price
  // Submit booking
  // Track booking status
}
```

### Phase 9: Testing
**Files to create:**
- `packages/backend/__tests__/services/multi-city-booking.test.ts` (new)
- `packages/client/tests/hooks/use-multi-city-booking.test.ts` (new)

**Test cases:**
- Create multi-city booking with valid segments
- Validate segment compatibility
- Calculate correct total price
- Handle payment processing for multi-city
- Process multi-city refunds
- Edge cases (empty segments, invalid dates, etc.)

### Deliverables
- New entities: MultiCityBooking, BookingSegment
- Multi-city booking service with all operations
- API endpoints for multi-city bookings
- Frontend pages and components
- Client hook for state management
- Smart contract integration
- Combined refund logic
- Comprehensive validation
- Test coverage

---

## Summary Table

| Issue | Type | Priority | Complexity | Files | Timeline |
|-------|------|----------|-----------|-------|----------|
| #223 | Performance | Medium | Medium | 5-8 | 2-3 weeks |
| #209 | Feature | High | High | 10-15 | 3-4 weeks |
| #221 | Security | High | Medium | 8-12 | 2-3 weeks |
| #208 | Feature | High | High | 12-18 | 4-5 weeks |

## Recommended Implementation Order
1. **#221** (Security) - Foundation for other features
2. **#223** (Performance) - Optimize before adding heavy features
3. **#208** (Multi-City) - Core feature enhancement
4. **#209** (Real-Time) - UI improvement with WebSocket

## Dependencies
- #221 → #209 (validation needed for real-time updates)
- #223 → #208 (optimization improves multi-city booking performance)
- #209 can run parallel to others (WebSocket is independent)

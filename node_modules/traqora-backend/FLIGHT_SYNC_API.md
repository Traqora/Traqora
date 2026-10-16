# Flight Synchronization API - REST Endpoints & Examples

## API Endpoints

### Flight Sync Operations

#### 1. Sync Single Flight
**Endpoint:** `POST /api/flights/{flightId}/sync`

**Request:**
```json
{
  "forceRefresh": false
}
```

**Response (Success):**
```json
{
  "success": true,
  "flight": {
    "id": "fl_123",
    "flightNumber": "LH001",
    "airline": "LH",
    "status": "SCHEDULED",
    "delayMinutes": 0,
    "gate": "A12",
    "terminal": "1",
    "departureTime": "2026-02-25T10:00:00Z",
    "arrivalTime": "2026-02-25T12:30:00Z",
    "dataSource": "AMADEUS",
    "syncStatus": "EXACT_MATCH",
    "lastSyncedAt": "2026-02-25T09:55:00Z"
  },
  "fromCache": false,
  "syncStatus": "EXACT_MATCH",
  "duration": 245
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Circuit breaker is OPEN",
  "statusCode": 503
}
```

---

#### 2. Batch Sync Flights
**Endpoint:** `POST /api/flights/sync-batch`

**Request:**
```json
{
  "flights": [
    {
      "flightNumber": "LH001",
      "airline": "LH",
      "departureDate": "2026-02-25"
    },
    {
      "flightNumber": "AF101",
      "airline": "AF",
      "departureDate": "2026-02-25"
    }
  ],
  "conflictResolutionMode": "PRIORITY"
}
```

**Response:**
```json
{
  "successful": [
    {
      "flight": { /* flight data */ },
      "fromCache": false,
      "syncStatus": "EXACT_MATCH"
    }
  ],
  "failed": [
    {
      "flight": { "flightNumber": "AF101", "airline": "AF" },
      "error": "Adapter not found",
      "statusCode": 404
    }
  ],
  "summary": {
    "total": 2,
    "successful": 1,
    "failed": 1,
    "duration": 523
  }
}
```

---

#### 3. Get Flight Sync Status
**Endpoint:** `GET /api/flights/{flightId}/sync-status`

**Response:**
```json
{
  "flight": {
    "id": "fl_123",
    "flightNumber": "LH001"
  },
  "lastSync": {
    "timestamp": "2026-02-25T09:55:00Z",
    "status": "EXACT_MATCH",
    "dataSource": "AMADEUS",
    "fromCache": false,
    "duration": 245
  },
  "syncHistory": [
    {
      "timestamp": "2026-02-25T09:55:00Z",
      "status": "EXACT_MATCH",
      "confljectDetected": false
    },
    {
      "timestamp": "2026-02-25T09:40:00Z",
      "status": "CONFLICT",
      "conflictResolution": "PRIORITY"
    }
  ],
  "availableSources": ["AMADEUS", "AIRLINE_API"],
  "nextScheduledSync": "2026-02-25T10:10:00Z"
}
```

---

#### 4. Resolve Flight Data Conflict
**Endpoint:** `POST /api/flights/{flightId}/resolve-conflict`

**Request:**
```json
{
  "conflictId": "conflict_456",
  "resolutionMode": "PRIORITY",
  "selectedSource": "AMADEUS",
  "overrideData": null
}
```

**Conflict Query Before:**
```json
{
  "flightNumber": "LH001",
  "conflictingFields": ["delayMinutes", "gate"],
  "sources": {
    "AMADEUS": {
      "delayMinutes": 15,
      "gate": "A12",
      "status": "DELAYED"
    },
    "AIRLINE_API": {
      "delayMinutes": 20,
      "gate": "B05",
      "status": "DELAYED"
    }
  },
  "timestamp": "2026-02-25T09:50:00Z",
  "severity": "HIGH"
}
```

**Response:**
```json
{
  "success": true,
  "conflict": {
    "id": "conflict_456",
    "status": "RESOLVED",
    "resolutionMode": "PRIORITY",
    "selectedData": {
      "delayMinutes": 15,
      "gate": "A12",
      "status": "DELAYED"
    },
    "selectedSource": "AMADEUS",
    "resolvedAt": "2026-02-25T09:51:00Z"
  },
  "flight": { /* updated flight */ }
}
```

---

#### 5. Webhook Receive
**Endpoint:** `POST /api/webhooks/flight-status`

**Headers:**
```
X-Webhook-Signature: sha256=abcd1234...
X-Webhook-Timestamp: 1708918200
```

**Request Body (from Amadeus/Airline API):**
```json
{
  "eventType": "FLIGHT_DELAYED",
  "timestamp": "2026-02-25T09:35:00Z",
  "flight": {
    "flightNumber": "LH001",
    "airline": "LH",
    "departureAirport": "FRA",
    "arrivalAirport": "LAX",
    "status": "DELAYED",
    "delayMinutes": 15,
    "gate": "A12",
    "terminal": "1",
    "reason": "Weather conditions"
  },
  "source": "AMADEUS"
}
```

**Response:**
```json
{
  "processed": true,
  "eventId": "evt_789",
  "flight": {
    "id": "fl_123",
    "flightNumber": "LH001",
    "syncStatus": "CONFLICT_RESOLVED"
  },
  "conflictResolved": false,
  "timestamp": "2026-02-25T09:35:01Z"
}
```

---

### Monitoring & Diagnostics

#### 6. Circuit Breaker Status
**Endpoint:** `GET /api/sync/circuit-breaker`

**Response:**
```json
{
  "state": "CLOSED",
  "successCount": 1247,
  "failureCount": 3,
  "lastStateChange": "2026-02-25T08:30:00Z",
  "stateChangeReason": "recovered_from_failure",
  "nextCheckTime": "2026-02-25T09:00:00Z",
  "health": "HEALTHY"
}
```

When OPEN:
```json
{
  "state": "OPEN",
  "failureCount": 5,
  "consecutiveFailures": 5,
  "lastFailureTime": "2026-02-25T09:45:00Z",
  "retryAfter": "2026-02-25T10:00:00Z",
  "health": "UNHEALTHY"
}
```

---

#### 7. Cache Statistics
**Endpoint:** `GET /api/sync/cache-stats`

**Response:**
```json
{
  "totalEntries": 342,
  "maxEntries": 10000,
  "memoryUsageMB": 12.5,
  "hits": 5847,
  "misses": 2103,
  "hitRate": 0.734,
  "averageLookupTimeMs": 0.8,
  "ttlMinutes": 15,
  "entries": [
    {
      "key": "LH001:2026-02-25:AMADEUS",
      "createdAt": "2026-02-25T09:55:00Z",
      "expiresAt": "2026-02-25T10:10:00Z",
      "accessCount": 12
    }
  ]
}
```

---

#### 8. Sync Service Health
**Endpoint:** `GET /api/sync/health`

**Response:**
```json
{
  "status": "HEALTHY",
  "checks": {
    "circuitBreaker": "HEALTHY",
    "cache": "HEALTHY",
    "amadeusApi": "HEALTHY",
    "adapters": {
      "LH": "HEALTHY",
      "AF": "HEALTHY",
      "BA": "HEALTHY"
    },
    "database": "HEALTHY",
    "scheduler": "RUNNING"
  },
  "metrics": {
    "uptime": 86400,
    "totalSyncs": 7950,
    "successRate": 0.987,
    "averageSyncTime": 156,
    "lastSync": "2026-02-25T09:55:00Z"
  }
}
```

---

#### 9. Scheduler Status
**Endpoint:** `GET /api/sync/scheduler`

**Response:**
```json
{
  "isRunning": true,
  "enabled": true,
  "interval": "*/15 * * * *",
  "lastRun": "2026-02-25T09:45:00Z",
  "nextRun": "2026-02-25T10:00:00Z",
  "stats": {
    "totalRuns": 384,
    "totalFlightsSynced": 45612,
    "totalFailures": 234,
    "averageDuration": 5430,
    "lastRunDuration": 5384
  }
}
```

---

### Configuration & Management

#### 10. Update Sync Configuration
**Endpoint:** `PATCH /api/sync/config`

**Request:**
```json
{
  "cacheTtlMinutes": 20,
  "batchSize": 150,
  "circuitBreakerThreshold": 3,
  "circuitBreakerTimeoutMs": 45000,
  "prioritizeActive": true,
  "webhookTimeout": 15000
}
```

**Response:**
```json
{
  "success": true,
  "config": {
    "cacheTtlMinutes": 20,
    "batchSize": 150,
    "circuitBreakerThreshold": 3,
    "circuitBreakerTimeoutMs": 45000,
    "prioritizeActive": true
  },
  "appliedAt": "2026-02-25T09:56:00Z"
}
```

---

#### 11. Clear Cache
**Endpoint:** `POST /api/sync/cache/clear`

**Request (Optional):**
```json
{
  "scope": "all",
  "flightNumber": null,
  "date": null
}
```

**Response:**
```json
{
  "success": true,
  "cleared": 342,
  "newTotal": 0,
  "timestamp": "2026-02-25T09:56:30Z"
}
```

---

#### 12. Force Scheduler Run
**Endpoint:** `POST /api/sync/scheduler/run`

**Request (Optional):**
```json
{
  "batchSize": 100,
  "prioritizeActive": true
}
```

**Response:**
```json
{
  "success": true,
  "run": {
    "startTime": "2026-02-25T09:56:45Z",
    "duration": 5231,
    "synced": 98,
    "failed": 2,
    "fromCache": 45,
    "conflicts": 3
  },
  "timestamp": "2026-02-25T09:57:05Z"
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "success": false,
  "error": "Circuit breaker is OPEN",
  "errorCode": "CIRCUIT_BREAKER_OPEN",
  "statusCode": 503,
  "timestamp": "2026-02-25T09:50:00Z",
  "retryAfter": 30
}
```

### Common Error Codes

| Code | Status | Meaning | Action |
|------|--------|---------|--------|
| INVALID_REQUEST | 400 | Malformed request | Fix request format |
| NOT_FOUND | 404 | Flight not found | Verify flight ID |
| ADAPTER_NOT_FOUND | 404 | Airline adapter missing | Add adapter |
| CIRCUIT_BREAKER_OPEN | 503 | Service failing | Wait and retry |
| CACHE_ERROR | 500 | Cache operation failed | Check Redis |
| AMADEUS_AUTH_FAILED | 401 | API credentials invalid | Verify credentials |
| RATE_LIMITED | 429 | Too many requests | Reduce request rate |
| CONFLICT_UNRESOLVABLE | 409 | Manual resolution needed | Operator review required |
| WEBHOOK_VERIFICATION_FAILED | 401 | Invalid signature | Check webhook secret |
| TIMEOUT | 504 | Operation took too long | Increase timeout or retry |

---

## Request/Response Examples

### Example 1: Complete Single Sync Flow

**Request:**
```bash
curl -X POST http://localhost:3000/api/flights/fl_123/sync \
  -H "Content-Type: application/json" \
  -d '{"forceRefresh": true}'
```

**Response Timeline:**
```
1. Check cache (cache miss, forceRefresh=true)
2. Check circuit breaker (CLOSED, proceed)
3. Fetch from Amadeus (success, 120ms)
4. Fetch from Airline Adapter (success, 95ms)
5. Compare data (no conflicts)
6. Store in DB (5ms)
7. Cache result (2ms)
8. Return response (total: 245ms)
```

---

### Example 2: Conflict Resolution Flow

**Request:**
```bash
curl -X POST http://localhost:3000/api/flights/fl_456/sync \
  -H "Content-Type: application/json" \
  -d '{"forceRefresh": false}'
```

**Response Timeline:**
```
1. Check cache (hit, return)
2. BUT... new webhook arrived with updated data
3. Compare with cache (conflict detected)
4. Apply automatic resolution (PRIORITY mode)
5. Amadeus (priority 1) wins: gate=A12, delay=15
6. Update DB with Amadeus data
7. Emit webhook to subscribers
```

---

### Example 3: Batch Sync with Mixed Results

**Request:**
```bash
curl -X POST http://localhost:3000/api/flights/sync-batch \
  -H "Content-Type: application/json" \
  -d '{
    "flights": [
      {"flightNumber": "LH001", "airline": "LH", "departureDate": "2026-02-25"},
      {"flightNumber": "AF101", "airline": "AF", "departureDate": "2026-02-25"},
      {"flightNumber": "XX999", "airline": "XX", "departureDate": "2026-02-25"}
    ]
  }'
```

**Response:**
- LH001: ✓ Success (from AMADEUS)
- AF101: ✓ Success (from Airline API)
- XX999: ✗ Failed (adapter not found)

---

## Rate Limiting

Each endpoint is rate-limited:

```
GET /api/sync/* : 1000 req/min per IP
POST /api/flights/sync* : 100 req/min per IP
POST /api/webhooks/* : 500 req/min per IP
```

**Rate Limit Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1708918260
```

---

## Pagination (for list endpoints)

```
GET /api/flights/conflicts?page=1&limit=50&status=UNRESOLVED

Response:
{
  "data": [ { conflict ... }, ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 342,
    "pages": 7
  }
}
```

---

## Authentication

All endpoints require JWT token:

```bash
curl -X GET http://localhost:3000/api/sync/health \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

## WebSocket Events (Real-time)

```javascript
// Connect
const ws = new WebSocket('ws://localhost:3000/sync-events');

// Listen for sync events
ws.on('message', (data) => {
  const event = JSON.parse(data);
  
  if (event.type === 'SYNC_STARTED') {
    console.log('Sync started:', event.flightNumber);
  } else if (event.type === 'SYNC_COMPLETED') {
    console.log('Sync complete:', event.flight);
  } else if (event.type === 'CONFLICT_DETECTED') {
    console.log('Conflict:', event.conflicting ields);
  }
});
```

---

## Integration Examples

### Using in Frontend
```typescript
// React hook
const { syncing, flight, error } = useSyncFlight(flightId, {
  autoSync: true,
  refreshInterval: 5 * 60 * 1000 // 5 minutes
});

// Display
{syncing && <Spinner />}
{flight && <FlightCard flight={flight} />}
{error && <ErrorAlert message={error} />}
```

### Using in Backend
```typescript
// Get sync service
const syncService = app.get(FlightSynchronizationService);

// Manual sync
const result = await syncService.syncFlight({
  flightNumber: 'LH001',
  airline: 'LH',
  departureDate: '2026-02-25'
});

// Subscribe to changes
syncService.registerWebhookCallback((payload) => {
  // Handle real-time updates
  notifySubscribers(payload);
});
```

---

## Performance Tips

1. **Use Cache:** Most responses within 10-20ms when cached
2. **Batch Operations:** Sync 50-100 flights at once
3. **Scheduled Jobs:** Let scheduler run at fixed intervals
4. **Set TTL Appropriately:** 5 min for active flights, 60 min for future
5. **Monitor Circuit Breaker:** Healthy CB = fast responses

---

## Troubleshooting API Issues

**"Circuit breaker is OPEN"**
→ Amadeus API is failing. Wait 30 seconds.

**"Adapter not found"**
→ Airline code not registered. Add adapter in initialization.

**"Conflict unresolvable"**
→ Manual review needed. Use resolve-conflict endpoint.

**"Cache hit rate low"**
→ Increase TTL or reduce variation in queries.

**"Webhook not received"**
→ Check webhook URL, signature verification, network.

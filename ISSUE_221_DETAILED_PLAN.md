# Issue #221: Add Input Sanitization and Validation - Detailed Plan

## Objective
Implement comprehensive server-side input validation, output encoding, and injection prevention.

## Priority: High | Type: Security | Estimated Duration: 2-3 weeks

---

## Phase 1: Comprehensive Validation Middleware

### 1.1 Create Sanitization Schemas
**File:** `packages/backend/src/schemas/sanitization.ts`

```typescript
import { z } from 'zod'

// Base patterns
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[1-9]\d{1,14}$/
const SOROBAN_ADDRESS_PATTERN = /^G[A-Z0-9]{55}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const NAME_PATTERN = /^[a-zA-Z\s'-]*$/

// User input sanitization
export const passengerSanitizationSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .toLowerCase()
    .trim()
    .max(255, 'Email too long'),
  firstName: z
    .string()
    .min(1, 'First name required')
    .max(100, 'First name too long')
    .regex(NAME_PATTERN, 'First name contains invalid characters')
    .transform(s => s.trim()),
  lastName: z
    .string()
    .min(1, 'Last name required')
    .max(100, 'Last name too long')
    .regex(NAME_PATTERN, 'Last name contains invalid characters')
    .transform(s => s.trim()),
  phone: z
    .string()
    .regex(PHONE_PATTERN, 'Invalid phone number')
    .optional(),
  sorobanAddress: z
    .string()
    .regex(SOROBAN_ADDRESS_PATTERN, 'Invalid Soroban address')
});

export const bookingSanitizationSchema = z.object({
  flightId: z
    .string()
    .uuid('Invalid flight ID format'),
  passenger: passengerSanitizationSchema
});

export const refundSanitizationSchema = z.object({
  bookingId: z
    .string()
    .uuid('Invalid booking ID format'),
  reason: z
    .string()
    .min(1, 'Reason required')
    .max(500, 'Reason too long'),
  requestedAmount: z
    .number()
    .int('Amount must be integer')
    .positive('Amount must be positive')
    .optional()
});

export const flightSearchSanitizationSchema = z.object({
  fromAirport: z
    .string()
    .min(3, 'Airport code too short')
    .max(3, 'Airport code too long')
    .uppercase()
    .regex(/^[A-Z]{3}$/, 'Invalid airport code format'),
  toAirport: z
    .string()
    .min(3, 'Airport code too short')
    .max(3, 'Airport code too long')
    .uppercase()
    .regex(/^[A-Z]{3}$/, 'Invalid airport code format'),
  departureDate: z
    .string()
    .datetime('Invalid date format')
    .refine(d => new Date(d) > new Date(), 'Departure date must be in future'),
  returnDate: z
    .string()
    .datetime('Invalid date format')
    .optional()
    .refine(
      d => !d || new Date(d) > new Date(),
      'Return date must be in future'
    ),
  passengers: z
    .number()
    .int('Passenger count must be integer')
    .min(1, 'At least 1 passenger required')
    .max(9, 'Maximum 9 passengers allowed')
});

export const userProfileSanitizationSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name required')
    .max(100, 'First name too long')
    .regex(NAME_PATTERN, 'First name contains invalid characters')
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name required')
    .max(100, 'Last name too long')
    .regex(NAME_PATTERN, 'Last name contains invalid characters')
    .optional(),
  phone: z
    .string()
    .regex(PHONE_PATTERN, 'Invalid phone number')
    .optional(),
  dateOfBirth: z
    .string()
    .datetime('Invalid date format')
    .optional()
});

// Query parameter sanitization
export const paginationSanitizationSchema = z.object({
  page: z
    .number()
    .int('Page must be integer')
    .positive('Page must be positive')
    .default(1),
  limit: z
    .number()
    .int('Limit must be integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20),
  sort: z
    .string()
    .regex(/^[a-zA-Z_]+:(asc|desc)$/, 'Invalid sort format')
    .optional()
});
```

### 1.2 Create Global Validation Middleware
**File:** `packages/backend/src/middleware/validation.ts` (comprehensive version)

```typescript
import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { logger } from '../utils/logger'
import { BadRequestError } from '../utils/errors'

// Schema registry
const schemaRegistry = new Map<string, z.ZodSchema>()

export function registerSchema(path: string, schema: z.ZodSchema): void {
  schemaRegistry.set(path, schema)
}

export function validateRequest(
  bodySchema?: z.ZodSchema,
  querySchema?: z.ZodSchema,
  paramsSchema?: z.ZodSchema
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate body
      if (bodySchema && Object.keys(req.body || {}).length > 0) {
        const result = bodySchema.safeParse(req.body)
        if (!result.success) {
          logValidationFailure(req, 'BODY', result.error)
          return res.status(400).json({
            success: false,
            error: {
              message: 'Request body validation failed',
              code: 'VALIDATION_ERROR',
              details: result.error.issues.map(issue => ({
                path: issue.path.join('.'),
                message: issue.message,
                code: issue.code
              }))
            }
          })
        }
        req.body = result.data
      }

      // Validate query parameters
      if (querySchema && Object.keys(req.query || {}).length > 0) {
        const result = querySchema.safeParse(req.query)
        if (!result.success) {
          logValidationFailure(req, 'QUERY', result.error)
          return res.status(400).json({
            success: false,
            error: {
              message: 'Query parameter validation failed',
              code: 'VALIDATION_ERROR',
              details: result.error.issues
            }
          })
        }
        req.query = result.data
      }

      // Validate path parameters
      if (paramsSchema && Object.keys(req.params || {}).length > 0) {
        const result = paramsSchema.safeParse(req.params)
        if (!result.success) {
          logValidationFailure(req, 'PARAMS', result.error)
          return res.status(400).json({
            success: false,
            error: {
              message: 'Path parameter validation failed',
              code: 'VALIDATION_ERROR',
              details: result.error.issues
            }
          })
        }
        req.params = result.data
      }

      next()
    } catch (error) {
      logger.error('Validation middleware error:', error)
      return res.status(500).json({
        success: false,
        error: {
          message: 'Internal validation error',
          code: 'INTERNAL_ERROR'
        }
      })
    }
  }
}

function logValidationFailure(req: Request, type: string, error: z.ZodError): void {
  const issues = error.issues.map(issue => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message
  }))

  logger.warn(`[VALIDATION_FAILURE] ${type}`, {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    issues
  })
}

// Middleware to strip unknown fields
export function stripUnknownFields(allowedFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      const filtered: any = {}
      for (const field of allowedFields) {
        if (field in req.body) {
          filtered[field] = req.body[field]
        }
      }
      req.body = filtered
    }
    next()
  }
}
```

### 1.3 Register Schemas with Routes
**File:** `packages/backend/src/api/routes/bookings.ts` (example)

```typescript
import { Router } from 'express'
import { validateRequest } from '../../middleware/validation'
import { bookingSanitizationSchema } from '../../schemas/sanitization'
import { paginationSanitizationSchema } from '../../schemas/sanitization'

const router = Router()

// Apply validation to POST /api/v1/bookings
router.post(
  '/',
  requireAuth,
  validateRequest(bookingSanitizationSchema),
  asyncHandler(async (req, res) => {
    // req.body is now guaranteed to be valid and sanitized
    const booking = await createBooking(req.body, req.user.id)
    res.json({ success: true, data: booking })
  })
)

// Apply validation to GET /api/v1/bookings with pagination
router.get(
  '/',
  requireAuth,
  validateRequest(undefined, paginationSanitizationSchema),
  asyncHandler(async (req, res) => {
    const bookings = await getBookings(req.user.id, req.query)
    res.json({ success: true, data: bookings })
  })
)

export default router
```

---

## Phase 2: SQL Injection Prevention

### 2.1 Audit and Secure Queries
**File:** `packages/backend/src/repositories/flightRepository.ts` (example)

```typescript
import { Repository } from 'typeorm'
import { Flight } from '../db/entities/Flight'

export class FlightRepository extends Repository<Flight> {
  /**
   * SECURE: Uses parameterized queries
   */
  async searchFlights(fromAirport: string, toAirport: string, date: Date) {
    return this.createQueryBuilder('flight')
      .where('flight.fromAirport = :from', { from: fromAirport })
      .andWhere('flight.toAirport = :to', { to: toAirport })
      .andWhere(
        'DATE(flight.departureTime) = DATE(:date)',
        { date }
      )
      .orderBy('flight.priceCents', 'ASC')
      .getMany()
  }

  /**
   * UNSAFE: Raw SQL concatenation (NEVER USE)
   * ❌ const query = `SELECT * FROM flights WHERE fromAirport = '${fromAirport}'`
   */

  /**
   * SECURE: Uses parameters with TypeORM
   */
  async getFlightById(id: string) {
    return this.createQueryBuilder('flight')
      .where('flight.id = :id', { id })
      .select([
        'flight.id',
        'flight.flightNumber',
        'flight.status'
      ])
      .getOne()
  }
}
```

### 2.2 Create Query Validation Utility
**File:** `packages/backend/src/utils/queryValidator.ts`

```typescript
export class QueryValidator {
  /**
   * Ensure no raw SQL is used
   */
  static validateNoRawSQL(query: string): void {
    const rawSQLPatterns = [
      /SELECT\s+\*\s+FROM/i,
      /DELETE\s+FROM/i,
      /DROP\s+TABLE/i,
      /TRUNCATE/i,
      /UPDATE\s+\w+\s+SET/i
    ]

    for (const pattern of rawSQLPatterns) {
      if (pattern.test(query)) {
        throw new Error('Raw SQL detected. Use TypeORM query builder instead.')
      }
    }
  }

  /**
   * Validate query parameters
   */
  static validateParams(
    query: string,
    params: Record<string, any>
  ): void {
    const paramPattern = /:(\w+)/g
    const expectedParams = new Set<string>()

    let match
    while ((match = paramPattern.exec(query)) !== null) {
      expectedParams.add(match[1])
    }

    for (const param of expectedParams) {
      if (!(param in params)) {
        throw new Error(`Missing parameter: ${param}`)
      }
    }
  }
}
```

---

## Phase 3: Output Encoding

### 3.1 Create Output Encoder
**File:** `packages/backend/src/utils/outputEncoder.ts`

```typescript
export class OutputEncoder {
  /**
   * HTML entity encoding for XSS prevention
   */
  static encodeHTML(str: string | null | undefined): string {
    if (!str) return ''

    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }

    return String(str).replace(/[&<>"']/g, m => map[m])
  }

  /**
   * URL encoding
   */
  static encodeURL(str: string): string {
    return encodeURIComponent(str)
  }

  /**
   * JSON encoding (escape context)
   */
  static encodeJSON(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
  }

  /**
   * Sanitize object recursively
   */
  static sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.encodeHTML(obj)
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item))
    }

    if (obj !== null && typeof obj === 'object') {
      const sanitized: any = {}
      for (const [key, value] of Object.entries(obj)) {
        // Only sanitize string values, not IDs or structured data
        if (typeof value === 'string' && !key.includes('Id')) {
          sanitized[key] = this.encodeHTML(value)
        } else if (typeof value === 'object') {
          sanitized[key] = this.sanitizeObject(value)
        } else {
          sanitized[key] = value
        }
      }
      return sanitized
    }

    return obj
  }
}
```

### 3.2 Apply Encoding to API Responses
**File:** `packages/backend/src/middleware/responseEncoder.ts` (new)

```typescript
import { Response } from 'express'
import { OutputEncoder } from '../utils/outputEncoder'

/**
 * Middleware to encode sensitive response data
 */
export function encodeResponseData(
  req: any,
  res: Response,
  next: Function
) {
  const originalJson = res.json.bind(res)

  res.json = function(data: any) {
    // Sanitize sensitive fields in response
    if (data && typeof data === 'object') {
      if (data.data) {
        data.data = OutputEncoder.sanitizeObject(data.data)
      }
      if (data.error?.message) {
        // Sanitize error messages
        data.error.message = OutputEncoder.encodeHTML(data.error.message)
      }
    }

    return originalJson(data)
  }

  next()
}
```

---

## Phase 4: NoSQL Injection Prevention

### 4.1 Secure NoSQL Queries
**File:** `packages/backend/src/services/amadeus/index.ts` (example)

```typescript
// SAFE: Explicit query builders
async getFlightData(flightNumber: string, airlineCode: string) {
  // Use explicit query operators
  const query = {
    flightNumber: flightNumber,
    airlineCode: airlineCode,
    dataSource: 'AMADEUS'
  }
  return this.collection.findOne(query)
}

// UNSAFE: Dynamic keys (NEVER USE)
// ❌ const query = { [userInput]: value }

// SAFE: Validate before using as key
async getSafeData(field: string, value: string) {
  const allowedFields = ['flightNumber', 'airlineCode', 'status']
  
  if (!allowedFields.includes(field)) {
    throw new Error('Invalid field')
  }

  const query = { [field]: value }
  return this.collection.findOne(query)
}
```

---

## Phase 5: API Endpoint Validation

### 5.1 Auth Endpoints
**File:** `packages/backend/src/api/routes/auth.ts` (add validation)

```typescript
import { validateRequest } from '../../middleware/validation'

router.post(
  '/challenge',
  validateRequest(
    z.object({
      address: z.string().regex(/^G[A-Z0-9]{55}$/)
    })
  ),
  asyncHandler(challengeHandler)
)

router.post(
  '/verify',
  validateRequest(
    z.object({
      address: z.string().regex(/^G[A-Z0-9]{55}$/),
      signature: z.string().min(1),
      signedMessage: z.string().min(1)
    })
  ),
  asyncHandler(verifyHandler)
)
```

### 5.2 Flight Search Endpoint
```typescript
router.get(
  '/search',
  validateRequest(undefined, flightSearchSanitizationSchema),
  asyncHandler(searchFlightsHandler)
)
```

### 5.3 Refund Endpoint
```typescript
router.post(
  '/request',
  requireAuth,
  validateRequest(refundSanitizationSchema),
  asyncHandler(createRefundHandler)
)
```

---

## Phase 6: Security Headers

### 6.1 Update Security Middleware
**File:** `packages/backend/src/middleware/securityMiddleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'

export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  )

  // X-Frame-Options (clickjacking protection)
  res.setHeader('X-Frame-Options', 'DENY')

  // X-Content-Type-Options (MIME sniffing prevention)
  res.setHeader('X-Content-Type-Options', 'nosniff')

  // X-XSS-Protection
  res.setHeader('X-XSS-Protection', '1; mode=block')

  // Referrer-Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions-Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

  // Strict-Transport-Security (HSTS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  next()
}

export function applySecurity(app: any) {
  // Apply helmet for additional security
  app.use(helmet({
    contentSecurityPolicy: false, // We set custom CSP above
    frameguard: { action: 'deny' },
    xssFilter: true,
    noSniff: true
  }))

  // Apply custom headers
  app.use(securityHeadersMiddleware)
}
```

---

## Phase 7: Rate Limiting by Type

### 7.1 Enhanced Rate Limiting
**File:** `packages/backend/src/middleware/rate-limit.ts`

```typescript
import { RateLimiterMemory } from 'rate-limiter-flexible'

const rateLimiters = {
  // Auth endpoints: 5 attempts per hour per IP
  auth: new RateLimiterMemory({
    points: 5,
    duration: 3600
  }),

  // Search endpoints: 30 requests per minute per user
  search: new RateLimiterMemory({
    points: 30,
    duration: 60
  }),

  // Booking endpoints: 10 requests per minute per user
  booking: new RateLimiterMemory({
    points: 10,
    duration: 60
  }),

  // File upload: 5 requests per hour per user
  upload: new RateLimiterMemory({
    points: 5,
    duration: 3600
  })
}

export async function checkAuthRateLimit(ip: string) {
  try {
    await rateLimiters.auth.consume(ip)
  } catch {
    throw new Error('Too many authentication attempts. Try again later.')
  }
}

export async function checkSearchRateLimit(userId: string) {
  try {
    await rateLimiters.search.consume(userId)
  } catch {
    throw new Error('Too many search requests. Try again later.')
  }
}

export async function checkBookingRateLimit(userId: string) {
  try {
    await rateLimiters.booking.consume(userId)
  } catch {
    throw new Error('Too many booking requests. Try again later.')
  }
}
```

---

## Phase 8: Security Logging & Monitoring

### 8.1 Create Security Audit Logger
**File:** `packages/backend/src/security/validation-audit.ts`

```typescript
import { logger } from '../utils/logger'

export class SecurityAuditLog {
  static logValidationFailure(
    userId: string | null,
    endpoint: string,
    reason: string,
    details: any
  ) {
    logger.warn('[SECURITY] Validation Failure', {
      userId,
      endpoint,
      reason,
      details,
      timestamp: new Date()
    })
  }

  static logInjectionAttempt(
    userId: string | null,
    endpoint: string,
    payload: string
  ) {
    logger.error('[SECURITY] Potential Injection Attempt', {
      userId,
      endpoint,
      payload: payload.substring(0, 100),
      timestamp: new Date()
    })
  }

  static logRateLimitExceeded(
    userId: string | null,
    endpoint: string,
    limit: number
  ) {
    logger.warn('[SECURITY] Rate Limit Exceeded', {
      userId,
      endpoint,
      limit,
      timestamp: new Date()
    })
  }

  static logUnknownFieldRemoved(
    userId: string | null,
    endpoint: string,
    fields: string[]
  ) {
    logger.info('[SECURITY] Unknown Fields Removed', {
      userId,
      endpoint,
      fields,
      timestamp: new Date()
    })
  }
}
```

---

## Implementation Checklist

- [ ] Phase 1: Sanitization schemas and middleware
- [ ] Phase 2: SQL injection prevention audit
- [ ] Phase 3: Output encoding implementation
- [ ] Phase 4: NoSQL injection prevention
- [ ] Phase 5: Validate all API endpoints
- [ ] Phase 6: Security headers implementation
- [ ] Phase 7: Rate limiting by type
- [ ] Phase 8: Security logging
- [ ] Integration tests for all security features
- [ ] Security audit with OWASP Top 10 checklist
- [ ] Penetration testing

---

## Testing Strategy

1. **Injection Tests**
   ```sql
   -- SQL Injection payloads
   ' OR '1'='1
   '; DROP TABLE flights; --
   UNION SELECT * FROM users
   ```

2. **XSS Tests**
   ```html
   <script>alert('XSS')</script>
   <img src=x onerror=alert('XSS')>
   ```

3. **Rate Limit Tests**
   - Exceed auth limit: expect error after 5 attempts
   - Exceed search limit: expect error after 30 requests/minute

4. **Field Validation Tests**
   - Invalid email format
   - Phone number validation
   - UUID format validation

---

## Success Metrics

- ✅ All inputs validated server-side
- ✅ No SQL injection vulnerabilities in audit
- ✅ No XSS vulnerabilities in responses
- ✅ Security headers properly set
- ✅ Rate limiting enforced
- ✅ Audit logs capture security events
- ✅ All tests passing (including security tests)
- ✅ OWASP A01:2021 compliance verified
- ✅ OWASP A03:2021 compliance verified
- ✅ OWASP A05:2021 compliance verified

---

## Related Issues
- Foundation for #209 (Real-Time Updates)
- Supports #208 (Multi-City Booking) validation

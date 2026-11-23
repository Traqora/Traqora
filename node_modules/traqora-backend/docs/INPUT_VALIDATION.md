# Input Validation and Sanitization Guide

This guide outlines how to handle user input securely in the Traqora backend.

## 1. Principles
- **Never Trust User Input**: All data coming from the client must be validated.
- **Whitelist over Blacklist**: Define what is allowed rather than what is forbidden.
- **Fail Fast**: Reject invalid input immediately at the edge (middleware/routes).

## 2. Using Zod for Validation
We use [Zod](https://github.com/colinhacks/zod) for schema validation. Every route handler should define a schema for `req.body`, `req.query`, and `req.params`.

### Example
```typescript
import { z } from 'zod';

const bookingSchema = z.object({
  flightId: z.string().uuid(),
  passengerCount: z.number().int().min(1).max(10),
  email: z.string().email(),
});

router.post('/', (req, res) => {
  const result = bookingSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }
  // Use result.data (which is typed and validated)
});
```

## 3. Sanitization
While Zod handles structure and types, we must also sanitize data to prevent injection attacks.

- **SQL Injection**: We use **TypeORM** with parameterized queries, which prevents SQL injection by default. Avoid using raw queries with string interpolation.
- **XSS**: Ensure that data returned to the frontend is properly escaped. On the backend, we can use libraries like `dompurify` or `sanitize-html` if we ever need to handle raw HTML (currently not needed).
- **NoSQL Injection**: Not applicable as we use PostgreSQL, but same principles apply to Redis keys.

## 4. Middleware
The `securityMiddleware.ts` includes headers that provide extra protection:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`

## 5. File Uploads
If file uploads are added:
- Validate file type (MIME type).
- Validate file size.
- Rename files to random strings to prevent path traversal.
- Scan for viruses if possible.

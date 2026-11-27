# Traqora API Documentation

## Overview

This document describes the OpenAPI (Swagger) specification integration for the Traqora backend API.

## OpenAPI Specification

The OpenAPI specification is automatically generated from zod validation schemas and serves as the single source of truth for API contracts.

### Accessing the Specification

- **Interactive Documentation**: `http://localhost:3001/api/docs`
- **Raw OpenAPI JSON**: `http://localhost:3001/api/openapi.json`
- **Worked Examples**: [EXAMPLES.md](./EXAMPLES.md) — ready-to-run request/response examples for auth, search, booking and refunds.
- **Cancellation and rate limits**: see the [cancellation flow](./EXAMPLES.md#5-cancellation) and [rate limit table](./EXAMPLES.md#6-rate-limits) in EXAMPLES.md.

## Schema Organization

Zod schemas are centralized in `packages/backend/src/api/schemas/index.ts` to enable automatic OpenAPI generation.

## Validation Middleware

Request validation is enforced through middleware that validates incoming requests against the OpenAPI specification before route handlers execute.

For booking creation, the passenger's email, first and last names, and wallet
address are required. The API trims names and rejects characters outside the
supported airline format. If the primary passenger's birth date is supplied,
use a valid calendar date in `YYYY-MM-DD` format. Invalid requests return HTTP
400 before a payable booking is created.

## Supplier Booking Confirmations

After confirming a reservation with the supplier, an operator with
`booking:reconcile` may record it using
`PUT /api/v1/admin/operations/bookings/{id}/supplier-reference` with the JSON
field `supplierBookingReference`. The endpoint returns 204 for the first
recording and for retries with the same value. A different reference returns
409 and requires operator reconciliation.

The matching GET endpoint requires the same permission. It returns the
recorded value or `null` for a booking that has no supplier confirmation.
References are encrypted in the booking database and excluded from ordinary
booking queries, logs, and on-chain transactions. Use the existing Traqora
booking reference for routine support and logs.

## Client Integration

TypeScript types are automatically generated for the client package using `openapi-typescript`:

- Generated types: `packages/client/lib/generated/api.ts`
- Generation script: `npm run generate:api-types`

## Development Workflow

### Updating API Endpoints

1. Update the corresponding zod schema in `packages/backend/src/api/schemas/index.ts`
2. Run `npm run generate:openapi` to update the OpenAPI specification
3. The updated spec will be available at `/api/openapi.json` and `/api/docs`

### Adding New Endpoints

1. Add the new zod schema to `packages/backend/src/api/schemas/index.ts`
2. Update the OpenAPI generator in `packages/backend/src/api/openapi/generator.ts` to include the new path and schema
3. Run `npm run generate:openapi`

## Error Handling

All validation errors follow the standardized error format:

```json
{
  "success": false,
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "details": { /* zod validation issues */ },
    "retryable": false,
    "requestId": "string",
    "timestamp": "ISO date string"
  }
}
```

## Troubleshooting

- **Missing dependencies**: Ensure `zod-to-openapi` and `openapi-typescript` are installed
- **TypeScript errors**: Check that `@types/node` is installed for Node.js type definitions
- **Build failures**: Verify that the OpenAPI generator script runs successfully before building

## Related Files

- Backend schema registry: `packages/backend/src/api/schemas/index.ts`
- OpenAPI generator: `packages/backend/src/api/openapi/generator.ts`
- Validation middleware: `packages/backend/src/middleware/validationMiddleware.ts`
- Client type generation: `packages/client/scripts/generate-api-types.ts`

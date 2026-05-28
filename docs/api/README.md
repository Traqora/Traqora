# Traqora API Documentation

## Overview

This document describes the OpenAPI (Swagger) specification integration for the Traqora backend API.

## OpenAPI Specification

The OpenAPI specification is automatically generated from zod validation schemas and serves as the single source of truth for API contracts.

### Accessing the Specification

- **Interactive Documentation**: `http://localhost:3001/api/docs`
- **Raw OpenAPI JSON**: `http://localhost:3001/api/openapi.json`

## Schema Organization

Zod schemas are centralized in `packages/backend/src/api/schemas/index.ts` to enable automatic OpenAPI generation.

## Validation Middleware

Request validation is enforced through middleware that validates incoming requests against the OpenAPI specification before route handlers execute.

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

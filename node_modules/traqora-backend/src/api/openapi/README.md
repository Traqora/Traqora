# OpenAPI Integration

This directory contains the OpenAPI (Swagger) specification generation and validation middleware for the Traqora backend API.

## Files

- `generator.ts`: Generates the OpenAPI specification from zod schemas
- `spec.json`: The generated OpenAPI specification (auto-generated)
- `README.md`: This documentation file

## Usage

### Generating OpenAPI Specification

Run the following command to generate or update the OpenAPI specification:

```bash
npm run generate:openapi
```

### Verifying OpenAPI Integration

Run the following command to verify that the OpenAPI integration is working correctly:

```bash
npm run verify:openapi
```

## Development Notes

- Zod schemas are centralized in `src/api/schemas/index.ts`
- The OpenAPI generator maps paths to their corresponding zod schemas
- Validation middleware applies request validation before route handlers execute
- The generated OpenAPI spec is served at `/api/openapi.json` and `/api/docs`

## Troubleshooting

- If you encounter TypeScript errors, ensure `@types/node` is installed
- If the generator fails, check that all required zod schemas are exported from the schema registry
- Make sure the OpenAPI generator script is properly configured with the correct paths and schemas

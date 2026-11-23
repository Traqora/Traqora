import { openApiDocument } from '../../src/api/openapi/generator';

describe('OpenAPI Snapshot', () => {
  it('matches the stored OpenAPI specification snapshot', () => {
    const document = openApiDocument;
    expect(document).toMatchSnapshot();
  });

  it('has required OpenAPI 3.0.0 structure', () => {
    const document = openApiDocument;
    expect(document.openapi).toBe('3.0.0');
    expect(document.info).toBeDefined();
    expect(document.info.title).toBe('Traqora Backend API');
    expect(document.info.version).toBe('1.0.0');
    expect(document.components).toBeDefined();
    expect(document.components.securitySchemes).toBeDefined();
    expect(document.paths).toBeDefined();
  });

  it('includes all security schemes', () => {
    const document = openApiDocument;
    const schemes = document.components.securitySchemes;
    expect(schemes.bearerAuth).toBeDefined();
    expect(schemes.apiKey).toBeDefined();
    expect(schemes.adminApiKey).toBeDefined();
  });

  it('includes core API paths', () => {
    const document = openApiDocument;
    const paths = Object.keys(document.paths);
    expect(paths).toContain('/api/v1/auth/challenge');
    expect(paths).toContain('/api/v1/auth/verify');
    expect(paths).toContain('/api/v1/auth/refresh');
    expect(paths).toContain('/api/v1/bookings');
    expect(paths).toContain('/api/v1/refunds/request');
  });

  it('has valid response schemas for each path', () => {
    const document = openApiDocument;
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
        expect(operation.responses).toBeDefined();
        expect(operation.responses['200'] || operation.responses['201']).toBeDefined();
        const successResponse = operation.responses['200'] || operation.responses['201'];
        expect(successResponse.content).toBeDefined();
        expect(successResponse.content['application/json']).toBeDefined();
        expect(successResponse.content['application/json'].schema).toBeDefined();
      }
    }
  });

  it('includes error response schemas with RFC 7807 structure', () => {
    const document = openApiDocument;
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
        expect(operation.responses['400']).toBeDefined();
        const errorResponse = operation.responses['400'];
        expect(errorResponse.content).toBeDefined();
        expect(errorResponse.content['application/json']).toBeDefined();
        const schema = errorResponse.content['application/json'].schema;
        expect(schema.properties).toBeDefined();
        expect(schema.properties.error).toBeDefined();
      }
    }
  });
});
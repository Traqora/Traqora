import { SchemasObject } from 'openapi3-ts';
import { ZodSchema } from 'zod';
export declare class OpenAPIGenerator {
    private schemas;
    private refs;
    constructor(schemas: ZodSchema<any>[]);
    generate(): SchemasObject;
    private generateSingle;
    private toOpenAPISchema;
    private flattenUnionTypes;
    private flattenIntersectionTypes;
    private unwrapOptional;
    private buildMetadata;
}
//# sourceMappingURL=openapi-generator.d.ts.map
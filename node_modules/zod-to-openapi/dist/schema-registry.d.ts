import { ZodSchema } from 'zod';
export declare class SchemaRegistry {
    readonly schemas: ZodSchema<unknown>[];
    constructor();
    register<T extends ZodSchema<any>>(name: string, schema: T): T;
}
//# sourceMappingURL=schema-registry.d.ts.map
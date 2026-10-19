import { SchemaObject } from 'openapi3-ts';
export interface ZodOpenAPIMetadata extends SchemaObject {
    name?: string;
}
declare module 'zod' {
    interface ZodTypeDef {
        openapi?: ZodOpenAPIMetadata;
    }
    abstract class ZodSchema<Output, Def extends ZodTypeDef, Input = Output> {
        openapi<T extends ZodSchema<any>>(this: T, metadata: ZodOpenAPIMetadata): T;
    }
}
//# sourceMappingURL=zod-extensions.d.ts.map
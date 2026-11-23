"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaRegistry = void 0;
class SchemaRegistry {
    constructor() {
        this.schemas = [];
    }
    register(name, schema) {
        const currentMetadata = schema._def.openapi;
        const schemaWithMetadata = schema.openapi(Object.assign(Object.assign({}, currentMetadata), { name }));
        this.schemas.push(schemaWithMetadata);
        return schemaWithMetadata;
    }
}
exports.SchemaRegistry = SchemaRegistry;
//# sourceMappingURL=schema-registry.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAPIGenerator = void 0;
const zod_1 = require("zod");
const lodash_1 = require("lodash");
class OpenAPIGenerator {
    constructor(schemas) {
        this.schemas = schemas;
        this.refs = {};
    }
    generate() {
        this.schemas.forEach(schema => this.generateSingle(schema));
        return this.refs;
    }
    generateSingle(zodSchema) {
        const innerSchema = this.unwrapOptional(zodSchema);
        const metadata = zodSchema._def.openapi ?
            zodSchema._def.openapi :
            innerSchema._def.openapi;
        const schemaName = metadata === null || metadata === void 0 ? void 0 : metadata.name;
        if (schemaName && this.refs[schemaName]) {
            return {
                '$ref': `#/components/schemas/${schemaName}`
            };
        }
        const result = lodash_1.omitBy(Object.assign(Object.assign({}, this.toOpenAPISchema(innerSchema, zodSchema.isNullable(), !!(metadata === null || metadata === void 0 ? void 0 : metadata.type))), (metadata ? this.buildMetadata(metadata) : {})), lodash_1.isUndefined);
        if (schemaName) {
            this.refs[schemaName] = result;
        }
        return result;
    }
    toOpenAPISchema(zodSchema, isNullable, hasOpenAPIType) {
        var _a, _b, _c, _d;
        if (zodSchema instanceof zod_1.ZodNull) {
            return { type: 'null' };
        }
        if (zodSchema instanceof zod_1.ZodString) {
            return {
                type: 'string',
                nullable: isNullable ? true : undefined
            };
        }
        if (zodSchema instanceof zod_1.ZodNumber) {
            return {
                type: 'number',
                minimum: (_a = zodSchema.minValue) !== null && _a !== void 0 ? _a : undefined,
                maximum: (_b = zodSchema.maxValue) !== null && _b !== void 0 ? _b : undefined,
                nullable: isNullable ? true : undefined
            };
        }
        if (zodSchema instanceof zod_1.ZodObject) {
            const propTypes = zodSchema._def.shape();
            const unknownKeysOption = zodSchema._unknownKeys;
            return {
                type: 'object',
                properties: lodash_1.mapValues(propTypes, propSchema => this.generateSingle(propSchema)),
                required: Object.entries(propTypes)
                    .filter(([_key, type]) => !type.isOptional())
                    .map(([key, _type]) => key),
                additionalProperties: unknownKeysOption === 'passthrough' || undefined,
                nullable: isNullable ? true : undefined
            };
        }
        if (zodSchema instanceof zod_1.ZodBoolean) {
            return { type: 'boolean' };
        }
        if (zodSchema instanceof zod_1.ZodArray) {
            const itemType = zodSchema._def.type;
            return {
                type: 'array',
                items: this.generateSingle(itemType),
                minItems: (_c = zodSchema._def.minLength) === null || _c === void 0 ? void 0 : _c.value,
                maxItems: (_d = zodSchema._def.maxLength) === null || _d === void 0 ? void 0 : _d.value
            };
        }
        if (zodSchema instanceof zod_1.ZodUnion) {
            const options = this.flattenUnionTypes(zodSchema);
            return {
                anyOf: options.map(schema => this.generateSingle(schema))
            };
        }
        if (zodSchema instanceof zod_1.ZodIntersection) {
            const subtypes = this.flattenIntersectionTypes(zodSchema);
            return {
                allOf: subtypes.map(schema => this.generateSingle(schema))
            };
        }
        if (hasOpenAPIType) {
            return {};
        }
        throw new Error('Unknown zod object type, please specify `type` and other OpenAPI props using `ZodSchema.openapi`');
    }
    flattenUnionTypes(schema) {
        if (!(schema instanceof zod_1.ZodUnion)) {
            return [schema];
        }
        const options = schema._def.options;
        return lodash_1.flatMap(options, option => this.flattenUnionTypes(option));
    }
    flattenIntersectionTypes(schema) {
        if (!(schema instanceof zod_1.ZodIntersection)) {
            return [schema];
        }
        const leftSubTypes = this.flattenIntersectionTypes(schema._def.left);
        const rightSubTypes = this.flattenIntersectionTypes(schema._def.right);
        return [...leftSubTypes, ...rightSubTypes];
    }
    unwrapOptional(schema) {
        while (schema instanceof zod_1.ZodOptional || schema instanceof zod_1.ZodNullable) {
            schema = schema.unwrap();
        }
        return schema;
    }
    buildMetadata(metadata) {
        return lodash_1.omitBy(lodash_1.omit(metadata, 'name'), lodash_1.isNil);
    }
}
exports.OpenAPIGenerator = OpenAPIGenerator;
//# sourceMappingURL=openapi-generator.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
// z.openapi = function(metadata) {
//
// }
zod_1.ZodSchema.prototype.openapi = function (openapi) {
    return new this.constructor(Object.assign(Object.assign({}, this._def), { openapi }));
};
const zodOptional = zod_1.ZodSchema.prototype.optional;
zod_1.ZodSchema.prototype.optional = function (...args) {
    const result = zodOptional.apply(this, args);
    result._def.openapi = this._def.openapi;
    return result;
};
const zodNullable = zod_1.ZodSchema.prototype.nullable;
zod_1.ZodSchema.prototype.nullable = function (...args) {
    const result = zodNullable.apply(this, args);
    result._def.openapi = this._def.openapi;
    return result;
};
//# sourceMappingURL=zod-extensions.js.map
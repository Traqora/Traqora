/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
export class NoopLogger {
    emit(_logRecord) { }
    enabled() {
        return false;
    }
}
export const NOOP_LOGGER = new NoopLogger();
//# sourceMappingURL=NoopLogger.js.map
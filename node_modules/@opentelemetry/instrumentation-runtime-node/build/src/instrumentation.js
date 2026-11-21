"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeNodeInstrumentation = void 0;
/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
const instrumentation_1 = require("@opentelemetry/instrumentation");
const eventLoopUtilizationCollector_1 = require("./metrics/eventLoopUtilizationCollector");
const eventLoopDelayCollector_1 = require("./metrics/eventLoopDelayCollector");
const gcCollector_1 = require("./metrics/gcCollector");
const heapSpacesSizeAndUsedCollector_1 = require("./metrics/heapSpacesSizeAndUsedCollector");
const eventLoopTimeCollector_1 = require("./metrics/eventLoopTimeCollector");
/** @knipignore */
const version_1 = require("./version");
const DEFAULT_CONFIG = {
    monitoringPrecision: 10,
};
class RuntimeNodeInstrumentation extends instrumentation_1.InstrumentationBase {
    _collectors = [];
    constructor(config = {}) {
        super(version_1.PACKAGE_NAME, version_1.PACKAGE_VERSION, Object.assign({}, DEFAULT_CONFIG, config));
        this._collectors = [
            new eventLoopUtilizationCollector_1.EventLoopUtilizationCollector(this._config),
            new eventLoopTimeCollector_1.EventLoopTimeCollector(this._config),
            new eventLoopDelayCollector_1.EventLoopDelayCollector(this._config),
            new gcCollector_1.GCCollector(this._config),
            new heapSpacesSizeAndUsedCollector_1.HeapSpacesSizeAndUsedCollector(this._config),
        ];
        if (this._config.enabled) {
            for (const collector of this._collectors) {
                collector.enable();
            }
        }
    }
    // Called when a new `MeterProvider` is set
    // the Meter (result of @opentelemetry/api's getMeter) is available as this.meter within this method
    _updateMetricInstruments() {
        if (!this._collectors)
            return;
        for (const collector of this._collectors) {
            collector.updateMetricInstruments(this.meter);
        }
    }
    init() {
        // Not instrumenting or patching a Node.js module
    }
    enable() {
        super.enable();
        if (!this._collectors)
            return;
        for (const collector of this._collectors) {
            collector.enable();
        }
    }
    disable() {
        super.disable();
        for (const collector of this._collectors) {
            collector.disable();
        }
    }
}
exports.RuntimeNodeInstrumentation = RuntimeNodeInstrumentation;
//# sourceMappingURL=instrumentation.js.map
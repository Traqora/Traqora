import type { InstrumentationScope } from '@opentelemetry/core';
import type { Context } from '@opentelemetry/api';
import type { LogRecordProcessor } from '../LogRecordProcessor';
import type { ReadableLogRecord } from './ReadableLogRecord';
import type { SeverityNumber } from '@opentelemetry/api-logs';
export declare class NoopLogRecordProcessor implements LogRecordProcessor {
    forceFlush(): Promise<void>;
    onEmit(_logRecord: ReadableLogRecord, _context: Context): void;
    shutdown(): Promise<void>;
    enabled(_options: {
        context: Context;
        instrumentationScope: InstrumentationScope;
        severityNumber?: SeverityNumber;
        eventName?: string;
    }): boolean;
}
//# sourceMappingURL=NoopLogRecordProcessor.d.ts.map
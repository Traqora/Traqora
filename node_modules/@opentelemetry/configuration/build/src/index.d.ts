export type { ConfigFactory } from './IConfigFactory';
export type { ConfigurationModel } from './models/configModel';
export type { LogRecordExporter as LogRecordExporterConfigModel } from './models/loggerProviderModel';
export type { PushMetricExporter as PushMetricExporterConfigModel, InstrumentType as InstrumentTypeConfigModel, Aggregation as AggregationConfigModel, PeriodicMetricReader as PeriodicMetricReaderConfigModel, } from './models/meterProviderModel';
export type { SpanExporter as SpanExporterConfigModel, SpanProcessor as SpanProcessorConfigModel, } from './models/tracerProviderModel';
export { createConfigFactory } from './ConfigFactory';
//# sourceMappingURL=index.d.ts.map
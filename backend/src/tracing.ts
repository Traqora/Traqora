import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { logger } from './utils/logger';

// Check if tracing is explicitly disabled
const tracingEnabled = process.env.ENABLE_TRACING === 'true';

let sdk: NodeSDK | null = null;

if (tracingEnabled) {
  const traceExporter = new OTLPTraceExporter({
    // Optional: Point to jaeger or your collector
    url: process.env.OTLP_TRACE_URL || 'http://localhost:4318/v1/traces',
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'traqora-backend',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
    }),
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  logger.info('OpenTelemetry tracing initialized and started');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk?.shutdown()
      .then(() => logger.info('OpenTelemetry tracing terminated'))
      .catch((error) => logger.error('Error terminating OpenTelemetry tracing', error))
      .finally(() => process.exit(0));
  });
} else {
  logger.info('OpenTelemetry tracing is disabled (set ENABLE_TRACING=true to enable)');
}

export { sdk };

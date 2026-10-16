import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Config } from './config/schema';
import { logger } from './utils/logger';

let sdk: NodeSDK | null = null;

const parseOtlpHeaders = (rawHeaders?: string): Record<string, string> | undefined => {
  if (!rawHeaders) {
    return undefined;
  }

  return rawHeaders.split(',').reduce<Record<string, string>>((headers, pair) => {
    const [rawKey, ...rawValueParts] = pair.split('=');
    const key = rawKey?.trim();
    const value = rawValueParts.join('=').trim();

    if (key && value) {
      headers[key] = value;
    }

    return headers;
  }, {});
};

export const initializeTracing = (runtimeConfig: Config): NodeSDK | null => {
  if (sdk) {
    return sdk;
  }

  if (!runtimeConfig.enableTracing) {
    logger.info('OpenTelemetry tracing disabled', {
      enableTracing: runtimeConfig.enableTracing,
    });
    return null;
  }

  const traceExporter = new OTLPTraceExporter({
    url: runtimeConfig.otlpTraceUrl,
    headers: parseOtlpHeaders(runtimeConfig.otlpTraceHeaders),
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: runtimeConfig.otelServiceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: runtimeConfig.otelServiceVersion,
      environment: runtimeConfig.environment,
    }),
    traceExporter,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(runtimeConfig.tracingSampleRate),
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  logger.info('OpenTelemetry tracing initialized', {
    otlpTraceUrl: runtimeConfig.otlpTraceUrl,
    sampleRate: runtimeConfig.tracingSampleRate,
  });

  return sdk;
};

export const shutdownTracing = async (): Promise<void> => {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
    logger.info('OpenTelemetry tracing terminated');
  } catch (error) {
    logger.error('Error terminating OpenTelemetry tracing', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    sdk = null;
  }
};

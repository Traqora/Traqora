import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from '../utils/logger';

// Create a Registry to register the metrics
export const register = new Registry();

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({
  register,
  prefix: 'traqora_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// ============================================================================
// HTTP Metrics
// ============================================================================

export const httpRequestDuration = new Histogram({
  name: 'traqora_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'traqora_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestErrors = new Counter({
  name: 'traqora_http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_type'],
  registers: [register],
});

// ============================================================================
// Business Metrics - Bookings
// ============================================================================

export const bookingsCreated = new Counter({
  name: 'traqora_bookings_created_total',
  help: 'Total number of bookings created',
  labelNames: ['status', 'airline'],
  registers: [register],
});

export const bookingsConfirmed = new Counter({
  name: 'traqora_bookings_confirmed_total',
  help: 'Total number of bookings confirmed on blockchain',
  labelNames: ['airline'],
  registers: [register],
});

export const bookingsFailed = new Counter({
  name: 'traqora_bookings_failed_total',
  help: 'Total number of failed bookings',
  labelNames: ['reason', 'airline'],
  registers: [register],
});

export const bookingRevenue = new Counter({
  name: 'traqora_booking_revenue_cents_total',
  help: 'Total booking revenue in cents',
  labelNames: ['currency', 'airline'],
  registers: [register],
});

export const activeBookings = new Gauge({
  name: 'traqora_active_bookings',
  help: 'Number of active bookings',
  labelNames: ['status'],
  registers: [register],
});

export const bookingProcessingDuration = new Histogram({
  name: 'traqora_booking_processing_duration_seconds',
  help: 'Duration of booking processing from creation to confirmation',
  labelNames: ['airline'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

// ============================================================================
// Business Metrics - Refunds
// ============================================================================

export const refundsRequested = new Counter({
  name: 'traqora_refunds_requested_total',
  help: 'Total number of refund requests',
  labelNames: ['airline', 'reason'],
  registers: [register],
});

export const refundsProcessed = new Counter({
  name: 'traqora_refunds_processed_total',
  help: 'Total number of processed refunds',
  labelNames: ['status', 'airline'],
  registers: [register],
});

export const refundAmount = new Counter({
  name: 'traqora_refund_amount_cents_total',
  help: 'Total refund amount in cents',
  labelNames: ['airline'],
  registers: [register],
});

export const refundProcessingDuration = new Histogram({
  name: 'traqora_refund_processing_duration_seconds',
  help: 'Duration of refund processing',
  labelNames: ['airline'],
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800],
  registers: [register],
});

// ============================================================================
// Business Metrics - Disputes
// ============================================================================

export const disputesCreated = new Counter({
  name: 'traqora_disputes_created_total',
  help: 'Total number of disputes created',
  labelNames: ['airline'],
  registers: [register],
});

export const disputesResolved = new Counter({
  name: 'traqora_disputes_resolved_total',
  help: 'Total number of resolved disputes',
  labelNames: ['verdict', 'airline'],
  registers: [register],
});

export const activeDisputes = new Gauge({
  name: 'traqora_active_disputes',
  help: 'Number of active disputes',
  labelNames: ['phase'],
  registers: [register],
});

// ============================================================================
// Blockchain Metrics
// ============================================================================

export const sorobanTransactions = new Counter({
  name: 'traqora_soroban_transactions_total',
  help: 'Total number of Soroban transactions',
  labelNames: ['contract', 'method', 'status'],
  registers: [register],
});

export const sorobanTransactionDuration = new Histogram({
  name: 'traqora_soroban_transaction_duration_seconds',
  help: 'Duration of Soroban transaction submission and confirmation',
  labelNames: ['contract', 'method'],
  buckets: [1, 3, 5, 10, 15, 30, 60, 120],
  registers: [register],
});

export const sorobanTransactionFees = new Histogram({
  name: 'traqora_soroban_transaction_fees_stroops',
  help: 'Soroban transaction fees in stroops',
  labelNames: ['contract', 'method'],
  buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
  registers: [register],
});

export const contractEvents = new Counter({
  name: 'traqora_contract_events_total',
  help: 'Total number of contract events',
  labelNames: ['contract', 'event_type'],
  registers: [register],
});

export const walletBalance = new Gauge({
  name: 'traqora_wallet_balance_xlm',
  help: 'Wallet balance in XLM',
  labelNames: ['wallet_address', 'wallet_type'],
  registers: [register],
});

// ============================================================================
// Database Metrics
// ============================================================================

export const databaseQueryDuration = new Histogram({
  name: 'traqora_database_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'entity'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

export const databaseConnections = new Gauge({
  name: 'traqora_database_connections',
  help: 'Number of active database connections',
  labelNames: ['state'],
  registers: [register],
});

export const databaseErrors = new Counter({
  name: 'traqora_database_errors_total',
  help: 'Total number of database errors',
  labelNames: ['error_type'],
  registers: [register],
});

// ============================================================================
// Payment Metrics
// ============================================================================

export const stripePayments = new Counter({
  name: 'traqora_stripe_payments_total',
  help: 'Total number of Stripe payments',
  labelNames: ['status', 'currency'],
  registers: [register],
});

export const stripePaymentAmount = new Counter({
  name: 'traqora_stripe_payment_amount_cents_total',
  help: 'Total Stripe payment amount in cents',
  labelNames: ['currency'],
  registers: [register],
});

export const stripeWebhooks = new Counter({
  name: 'traqora_stripe_webhooks_total',
  help: 'Total number of Stripe webhooks received',
  labelNames: ['event_type', 'status'],
  registers: [register],
});

// ============================================================================
// Error Metrics
// ============================================================================

export const applicationErrors = new Counter({
  name: 'traqora_application_errors_total',
  help: 'Total number of application errors',
  labelNames: ['error_type', 'severity', 'component'],
  registers: [register],
});

export const idempotencyKeyConflicts = new Counter({
  name: 'traqora_idempotency_key_conflicts_total',
  help: 'Total number of idempotency key conflicts',
  registers: [register],
});

// ============================================================================
// System Health Metrics
// ============================================================================

export const systemHealth = new Gauge({
  name: 'traqora_system_health',
  help: 'System health status (1 = healthy, 0 = unhealthy)',
  labelNames: ['component'],
  registers: [register],
});

export const uptimeSeconds = new Gauge({
  name: 'traqora_uptime_seconds',
  help: 'Application uptime in seconds',
  registers: [register],
});

// ============================================================================
// Helper Functions
// ============================================================================

const startTime = Date.now();

export const updateUptimeMetric = () => {
  const uptimeInSeconds = (Date.now() - startTime) / 1000;
  uptimeSeconds.set(uptimeInSeconds);
};

export const recordBookingCreated = (airline: string, status: string) => {
  bookingsCreated.inc({ status, airline });
  logger.debug('Metric recorded: booking created', { airline, status });
};

export const recordBookingConfirmed = (airline: string, amountCents: number, currency: string, durationSeconds: number) => {
  bookingsConfirmed.inc({ airline });
  bookingRevenue.inc({ currency, airline }, amountCents);
  bookingProcessingDuration.observe({ airline }, durationSeconds);
  logger.debug('Metric recorded: booking confirmed', { airline, amountCents, durationSeconds });
};

export const recordBookingFailed = (airline: string, reason: string) => {
  bookingsFailed.inc({ reason, airline });
  logger.debug('Metric recorded: booking failed', { airline, reason });
};

export const recordRefundRequest = (airline: string, reason: string) => {
  refundsRequested.inc({ airline, reason });
  logger.debug('Metric recorded: refund requested', { airline, reason });
};

export const recordRefundProcessed = (airline: string, status: string, amountCents: number, durationSeconds: number) => {
  refundsProcessed.inc({ status, airline });
  refundAmount.inc({ airline }, amountCents);
  refundProcessingDuration.observe({ airline }, durationSeconds);
  logger.debug('Metric recorded: refund processed', { airline, status, amountCents });
};

export const recordDisputeCreated = (airline: string) => {
  disputesCreated.inc({ airline });
  logger.debug('Metric recorded: dispute created', { airline });
};

export const recordDisputeResolved = (airline: string, verdict: string) => {
  disputesResolved.inc({ verdict, airline });
  logger.debug('Metric recorded: dispute resolved', { airline, verdict });
};

export const recordSorobanTransaction = (
  contract: string,
  method: string,
  status: 'success' | 'failed',
  durationSeconds: number,
  feeStroops?: number
) => {
  sorobanTransactions.inc({ contract, method, status });
  sorobanTransactionDuration.observe({ contract, method }, durationSeconds);
  if (feeStroops) {
    sorobanTransactionFees.observe({ contract, method }, feeStroops);
  }
  logger.debug('Metric recorded: soroban transaction', { contract, method, status, durationSeconds });
};

export const recordContractEvent = (contract: string, eventType: string) => {
  contractEvents.inc({ contract, event_type: eventType });
  logger.debug('Metric recorded: contract event', { contract, eventType });
};

export const updateWalletBalance = (walletAddress: string, walletType: string, balanceXLM: number) => {
  walletBalance.set({ wallet_address: walletAddress, wallet_type: walletType }, balanceXLM);
  logger.debug('Metric updated: wallet balance', { walletAddress, walletType, balanceXLM });
};

export const recordStripePayment = (status: string, currency: string, amountCents: number) => {
  stripePayments.inc({ status, currency });
  stripePaymentAmount.inc({ currency }, amountCents);
  logger.debug('Metric recorded: stripe payment', { status, currency, amountCents });
};

export const recordStripeWebhook = (eventType: string, status: string) => {
  stripeWebhooks.inc({ event_type: eventType, status });
  logger.debug('Metric recorded: stripe webhook', { eventType, status });
};

export const recordApplicationError = (errorType: string, severity: 'low' | 'medium' | 'high' | 'critical', component: string) => {
  applicationErrors.inc({ error_type: errorType, severity, component });
  logger.debug('Metric recorded: application error', { errorType, severity, component });
};

export const updateSystemHealth = (component: string, isHealthy: boolean) => {
  systemHealth.set({ component }, isHealthy ? 1 : 0);
  logger.debug('Metric updated: system health', { component, isHealthy });
};

// Update uptime every 10 seconds
setInterval(updateUptimeMetric, 10000);
updateUptimeMetric();

logger.info('Prometheus metrics initialized');

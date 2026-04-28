# Operations Runbooks

## Introduction
These runbooks provide step-by-step procedures for common incidents. Each runbook includes Symptoms, Diagnosis, Resolution, and Prevention.

## Runbook Topics
1. Database Down
2. Smart Contract Failure
3. Payment Timeout
4. High Error Rate
5. Booking Failure Surge
6. Blockchain Transaction Failure
7. Low Wallet Balance
8. Redis / Cache Failure
9. External API Outage
10. Deployment/Release Failure

---

## 1. Database Down
**Symptom:** `DatabaseConnectionFailed` alert, backend 500 errors, failed queries.

**Diagnosis:**
- Confirm PostgreSQL process status.
- Check database logs and connection pool errors.
- Validate network connectivity between backend and DB.
- Confirm credentials and firewall rules.

**Resolution:**
- Restart the database or fail over to a replica.
- Restore connectivity and clear connection backlog.
- Confirm `SELECT 1` succeeds from the backend host.
- Resume service and monitor.

**Prevention:**
- Maintain healthy replica configuration.
- Monitor DB connection latency and pool exhaustion.
- Test failover procedures regularly.

**Dashboard:** Database health, query latency, connection count.

---

## 2. Smart Contract Failure
**Symptom:** failed Soroban transactions, contract execution errors, booking or refund failures.

**Diagnosis:**
- Inspect on-chain transaction logs and contract error codes.
- Validate contract deployment status on Stellar.
- Check backend contract arguments and network configuration.
- Confirm dependent services are reachable.

**Resolution:**
- Roll back or redeploy the contract if unsafe changes were released.
- Retry failed transactions once the contract is stable.
- Fix contract arguments or invocation patterns in the backend.

**Prevention:**
- Use contract regression tests and staged deployments.
- Monitor transaction success rate and contract error metrics.

**Dashboard:** Soroban transaction failure rate, contract invocation success.

---

## 3. Payment Timeout
**Symptom:** payments stall, checkout hangs, `payment` timeout alerts.

**Diagnosis:**
- Check payment gateway response times and circuit breaker state.
- Review backend job queue status.
- Confirm blockchain RPC connectivity and wallet state.

**Resolution:**
- Retry payment requests with exponential backoff.
- Clear any stale or timed-out payment sessions.
- Fail over to alternate payment provider if configured.

**Prevention:**
- Apply timeouts and retries in payment workflows.
- Monitor queue depth and payment processing latency.

**Dashboard:** payment timeouts, queue length, third-party gateway latency.

---

## 4. High Error Rate
**Symptom:** `HighErrorRate` alert, elevated `5xx` rates, poor user experience.

**Diagnosis:**
- Inspect backend logs for common failure patterns.
- Identify recent deployments or configuration changes.
- Validate database, Redis, and blockchain dependencies.

**Resolution:**
- Roll back the offending deployment or fix the configuration.
- Restart affected services if needed.
- Patch the root cause and deploy a verified fix.

**Prevention:**
- Use feature flags and canary releases.
- Monitor error budgets and regression test release candidates.

**Dashboard:** error rate, response time, recent deploys.

---

## 5. Booking Failure Surge
**Symptom:** `HighBookingFailureRate` alert, many failed booking transactions.

**Diagnosis:**
- Check booking service logs and payment gateway behavior.
- Verify contract and blockchain transaction status.
- Confirm external inventory or pricing APIs are healthy.

**Resolution:**
- Throttle or pause booking traffic if needed.
- Resolve underlying payment or contract issues.
- Retry or refund affected bookings as necessary.

**Prevention:**
- Monitor booking success rate and external dependencies.
- Implement backpressure for upstream services.

**Dashboard:** booking failure rate, payment success, API error rate.

---

## 6. Blockchain Transaction Failure
**Symptom:** failed Soroban transactions, blockchain execution errors, stalled confirmations.

**Diagnosis:**
- Inspect Stellar RPC and Soroban transaction logs.
- Confirm network health and node availability.
- Validate wallet balances and transaction fees.

**Resolution:**
- Retry failed transactions once the network is healthy.
- Fix invalid transaction payloads or contract arguments.
- Replace an unhealthy RPC endpoint if required.

**Prevention:**
- Monitor transaction failure rates and RPC latency.
- Keep wallet balances funded above minimum thresholds.

**Dashboard:** blockchain transaction failure rate, RPC latency.

---

## 7. Low Wallet Balance
**Symptom:** low wallet balance alerts, inability to submit blockchain transactions.

**Diagnosis:**
- Check the wallet account balance in Stellar.
- Confirm pending transactions have not consumed funds.
- Validate the configured wallet key and account.

**Resolution:**
- Replenish the wallet with required XLM or stablecoin.
- Pause transaction processing until balance recovers.

**Prevention:**
- Monitor wallet balance continuously.
- Set automatic top-up or alert thresholds.

**Dashboard:** wallet balance, pending transaction count.

---

## 8. Redis / Cache Failure
**Symptom:** stale cache, backend errors, high latency, Redis connection errors.

**Diagnosis:**
- Confirm Redis process status and persistence health.
- Check memory usage and eviction warnings.
- Review cache hit ratio and request patterns.

**Resolution:**
- Restart Redis service or fail over to replica.
- Clear stale cache entries and warm the cache.
- Restore AOF/RDB persistence if corruption occurred.

**Prevention:**
- Monitor Redis memory, persistence, and connection counts.
- Use replication and periodic persistence tests.

**Dashboard:** Redis memory usage, eviction rate, cache hit ratio.

---

## 9. External API Outage
**Symptom:** service dependency failures, timeouts from third-party APIs.

**Diagnosis:**
- Confirm the external provider status.
- Check retries, timeouts, and circuit breaker state.
- Validate whether the issue is isolated to one provider.

**Resolution:**
- Fail over to an alternate provider if available.
- Retry with exponential backoff.
- Notify stakeholders and update status pages.

**Prevention:**
- Monitor external API latency and failure rates.
- Implement fallback providers and graceful degradation.

**Dashboard:** third-party API success rates, request latency.

---

## 10. Deployment / Release Failure
**Symptom:** failed deploy alerts, service crash after release, rollback required.

**Diagnosis:**
- Review release notes and deployment logs.
- Compare new configuration with the previous release.
- Validate whether the failure is code, environment, or infrastructure related.

**Resolution:**
- Roll back to the previous working version.
- Fix the root cause in a staging environment.
- Re-deploy after verification.

**Prevention:**
- Use canary deployments and staged verification.
- Validate rollback steps before every production release.

**Dashboard:** deployment success, service health after release.

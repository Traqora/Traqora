# Troubleshooting Guide

## Purpose
This guide provides a structured approach for troubleshooting production issues and discovering root causes. Use the templates and decision trees to reduce mean time to resolution.

## Troubleshooting Process
1. Identify the impacted service and scope.
2. Collect available telemetry: logs, metrics, traces, alerts.
3. Apply the symptom-diagnosis-resolution-prevention framework.
4. Escalate according to severity if needed.
5. Document findings and update runbooks.

## Troubleshooting Template
- **Symptom**: What triggered the alert or incident?
- **Impact**: Which service, feature, or customer flow is affected?
- **Diagnosis**: What evidence supports the root cause?
- **Resolution**: What actions fixed the issue?
- **Prevention**: What changes stop it happening again?

## Common Troubleshooting Categories
- Infrastructure failure
- Database connectivity
- Smart contract or blockchain errors
- Payment processing issues
- API or frontend errors
- External integrations and third-party outages

## Key Diagnostic Tools
- Grafana dashboards
- Prometheus alert history
- Backend logs in Docker or centralized logging
- Database logs and query plan analysis
- Network and firewall diagnostics
- Stellar transaction tracing tools

## Decision Tree: Service Health Issue
1. Is the service reachable? If no, check load balancer / container health.
2. If reachable, check service logs for startup or runtime errors.
3. If the service is running, verify dependencies: database, Redis, blockchain RPC.
4. If dependencies are healthy, validate application error rates and latency.
5. If errors persist, escalate to operations and engineering.

## Troubleshooting Checklist
- [ ] Confirm the alert severity and affected customer impact.
- [ ] Verify current incident status in PagerDuty or Slack.
- [ ] Collect logs from backend and orchestrator.
- [ ] Confirm database connection status and query errors.
- [ ] Check Redis health and cache errors.
- [ ] Validate blockchain RPC connectivity and wallet balance.
- [ ] Confirm contract execution and Soroban transaction status.
- [ ] Identify recent deployments or configuration changes.

## Troubleshooting Scenarios
### API or Backend Service Failure
- Symptom: `ServiceDown` alert or `500` errors across endpoints.
- Diagnosis: Check backend service logs and `GET /health`.
- Resolution: Restart the service, restore configuration, or roll back the deployment.
- Prevention: Add readiness checks, apply circuit breaker limits, and monitor error budgets.

### Database Connectivity Issues
- Symptom: `DatabaseConnectionFailed` alert or failed queries.
- Diagnosis: Confirm PostgreSQL is reachable and authentication succeeds.
- Resolution: Restart DB service, fail over to replica, or restore connectivity.
- Prevention: Maintain healthy replica sets, test failover regularly, and keep credentials rotated.

### Smart Contract and Blockchain Errors
- Symptom: transaction failures, `payment` timeouts, or contract execution errors.
- Diagnosis: Inspect Soroban transaction logs and Stellar RPC responses.
- Resolution: Retry with backoff, check contract deployment state, or revert contract changes.
- Prevention: Add end-to-end contract tests and monitor transaction success rates.

### Payment Timeout or Processing Failures
- Symptom: blocked bookings, payment timeout alerts, or stale transactions.
- Diagnosis: Validate payment gateway connectivity and transaction queue health.
- Resolution: Retry payments, clear stale requests, or fail over to alternate provider.
- Prevention: Monitor timeout thresholds and queue lengths.

## Escalation Guidance
- If the issue is unresolved within the first 15 minutes, escalate to the next on-call engineer.
- For SEV1 and SEV2 incidents, notify operations manager and stakeholders immediately.
- Use the escalation tree in `docs/operations/INCIDENT_RESPONSE.md`.

## Update Runbooks
After resolving the issue, update this guide or `docs/operations/RUNBOOKS.md` with any missed steps, improved checks, or new diagnostic commands.

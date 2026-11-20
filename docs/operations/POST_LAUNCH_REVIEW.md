# Post-Launch Monitoring and Review Cadence

This cadence defines who reviews the V1 signals, how often, and what action a
review can trigger. It is the operating companion to the [V1 deployment
runbook](./V1_DEPLOYMENT_RUNBOOK.md) and the [V1 launch readiness
sign-off](../LAUNCH_READINESS.md). Signal definitions live once in
[Monitoring and Observability](../monitoring.md); this document does not repeat
them.

## Principles

- Every signal has one accountable owner and a named delegate for cover.
- A review produces a written outcome: healthy, watch, or action required.
- "Action required" names an owner and a due date, and is tracked until closed.
- Reviewing a signal is not the same as fixing it. Fixes follow the relevant
  runbook in [Operations Runbooks](./RUNBOOKS.md) and the incident process in
  [Incident Response](./INCIDENT_RESPONSE.md).

## Owners and intervals

| Signal | Accountable owner | Delegate | Interval | Source |
| --- | --- | --- | --- | --- |
| Incidents and alerts | Platform Owner | Backend Owner | Continuous on call, reviewed every shift handover | Prometheus alerts in `monitoring/prometheus/alerts.yml`, AlertManager, [Incident Response](./INCIDENT_RESPONSE.md) |
| Booking success and funnel | Backend Owner | QA Owner | Daily for the first week, then twice weekly | SLO dashboard `monitoring/grafana/dashboards/traqora-slo.json`, funnel rules in `monitoring/prometheus/slo-rules.yml` |
| Refunds and payouts | Backend Owner | Support Owner | Daily for the first week, then weekly | Refund SLO events, [Booking Failure Incident Runbooks](./BOOKING_FAILURE_RUNBOOKS.md), refund audit filters in [Operations Health and Audit Filters](./OPERATIONS_HEALTH_AND_AUDIT.md) |
| Latency and error budget | Backend Owner | Platform Owner | Daily for the first week, then weekly | `traqora_slo_observed_latency_seconds`, burn-rate alerts, [SLO burn runbook](https://github.com/traqora/runbooks/slo-burn.md) |
| Support feedback | Support Owner | Product owner | Daily during the first week, then weekly | Support queue, tagged feedback themes, audited booking lookup trail |
| Release health | Release Manager | Platform Owner | End of first day, end of first week, then at each release | [V1 deployment runbook](./V1_DEPLOYMENT_RUNBOOK.md) smoke results and change record |

If a named owner is unavailable, the delegate acts with the same authority. The
Release Manager records any permanent owner change in the sign-off document.

## What each review checks

### Incidents and alerts

- Any firing alert, its severity, time to acknowledgement and current status.
- Whether each incident has an owner, a root cause note and a follow-up ticket.
- Whether alert volume is noisy enough to hide a real failure.

Escalate to the Release Manager when a critical alert is open longer than the
acknowledgement target or when the same alert fires twice in one week.

### Booking success and funnel

- Search to created to confirmed conversion against the pre-launch baseline.
- Failed or stalled confirmations and the Stellar transaction IDs involved.
- Whether the funnel dashboard is receiving fresh events.

A sustained drop below the recorded baseline moves the signal to "action
required" and a booking failure investigation is opened using
[BOOKING_FAILURE_RUNBOOKS.md](./BOOKING_FAILURE_RUNBOOKS.md).

### Refunds and payouts

- Refund completion against the SLO target and the count of refunds older than
  the agreed threshold.
- Refunds rejected for policy or contract errors, grouped by cause.
- Whether any refund backlog is growing across two consecutive reviews.

### Latency and error budget

- p95 latency for search, booking and refund against the targets in
  [monitoring.md](../monitoring.md).
- Remaining error budget per operation and any fast or slow burn alert.
- Whether a regression correlates with a recent deploy or contract upgrade.

### Support feedback

- Volume and theme of booking, payment and refund complaints.
- Any report of a security, privacy or accessibility problem, which is routed
  immediately to the Security Owner rather than waiting for the next review.
- Whether a known issue already has a public status note.

## Records and escalation

Each review is appended to the change record or incident log with the date,
reviewer, outcome and any follow-up. A signal stays on "watch" for at most two
reviews before it is either closed with evidence or escalated to "action
required". The Release Manager chairs a 30 minute review at the end of the
first week and decides whether the cadence continues at the reduced interval.

Related reading: [Monitoring and Observability](../monitoring.md),
[Operations Health and Audit Filters](./OPERATIONS_HEALTH_AND_AUDIT.md),
[Production Deployment Guide](./DEPLOYMENT.md).

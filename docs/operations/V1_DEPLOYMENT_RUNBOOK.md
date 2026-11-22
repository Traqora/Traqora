# V1 Operator Deployment Runbook

This is the operator-facing, start-to-finish procedure for a V1 release. It
owns the sequence, the required evidence and the accountable roles. Detailed
service-level and contract-level steps stay in the documents linked below so
there is one source of truth for each procedure.

## Scope and ownership

A V1 release covers the backend and client workspaces, database migrations and
any separately released Soroban contracts. It does not add V1 scope. Roles are
accountable for their step even when a delegate performs the work.

| Role | Accountable for | Evidence they leave behind |
| --- | --- | --- |
| Release Manager | Branch, change record, go/no-go call, communication | Release PR and completed sign-off in [V1 Launch Readiness](../LAUNCH_READINESS.md) |
| Backend Owner | Migrations, backend deploy, backend smoke checks | Migration log, `/health` result, deploy record |
| Client Owner | Client deploy, client smoke checks | Deploy record, smoke result |
| Platform Owner | Infrastructure, secrets, monitoring and alerting | Configuration verification checklist |
| Contracts Owner | Contract deploy or upgrade, snapshot review | Snapshot review sign-off, WASM checksum |
| Support Owner | Operator notice, support handoff | Posted notice, handoff acknowledgement |
| QA Owner | Test signal, focused suites, rollback drill | Focused suite results, drill record |

## Before the release window

1. Confirm the release branch is based on the latest `upstream/main` and the
   change record lists every included PR.
2. Confirm the [V1 launch readiness sign-off](../LAUNCH_READINESS.md) is complete
   for product, security, operations, support and release verification. A
   NO-GO from security or release verification stops the release.
3. Confirm CI is green on the release commit for both workspaces. The required
   lint, typecheck, unit test and build steps are locked by
   `packages/backend/tests/security/ciWorkspaceChecks.test.ts`.
4. Confirm the full [Production Deployment Checklist](../DEPLOYMENT_CHECKLIST.md)
   and the [environment reference](../ENV_REFERENCE.md) have been reviewed.
5. Confirm a tested backup exists and note its identifier in the change record.

## Configuration verification (Platform Owner)

Verify before any deploy. Stop if a value is missing or points at the wrong
environment.

- Required secrets for PostgreSQL, Redis, Stellar RPC and wallet services are
  present, scoped to production and not reused from staging.
- `GET /health` on the current version returns `200` and the database and Redis
  checks are healthy.
- Prometheus is scraping the backend `/metrics` endpoint and the SLO rules in
  `monitoring/prometheus/slo-rules.yml` are loaded.
- AlertManager routes reach the on-call Slack and PagerDuty targets.
- DNS, load balancer and TLS configuration match the release target.

## Database migrations (Backend Owner)

1. Record the current migration version in the change record.
2. Apply migrations with `npm run migration:run --workspace=packages/backend`
   inside the agreed maintenance window.
3. Confirm the new schema with a read-only validation query and record the
   resulting migration version.
4. Do not edit an applied migration. If a migration must be undone, use
   `npm run migration:revert --workspace=packages/backend` only after the
   Backend Owner and Release Manager agree the data loss is acceptable.

## Deploy sequence

1. Deploy the backend artifact with the production configuration.
2. Deploy the client artifact only after `GET /health` is green on the backend.
3. Deploy contract or chain-level changes separately, following the
   [Contract Deployment Runbook](./CONTRACT_DEPLOYMENT_RUNBOOK.md) and the
   [Contract Snapshot Review Policy](./CONTRACT_SNAPSHOT_REVIEW.md). Record the
   new WASM checksum.
4. Do not combine a contract upgrade with an unrelated backend or client change
   in the same window.

## Smoke tests (Backend and Client Owners)

Use the [smoke checklist](./smoke-checklist.md) and the verification steps in
the [Production Deployment Guide](./DEPLOYMENT.md). At minimum, confirm:

- login and wallet connection succeed;
- a flight search returns offers from the configured providers;
- a sample booking reaches confirmation, or can be traced in staging or canary;
- payment and refund flows create the expected records;
- the Grafana booking funnel SLO dashboard is receiving fresh data;
- no new critical alert has fired.

If a smoke check fails, stop the rollout and follow the rollback section. Do
not mark a check as passed on the strength of a passing unit suite alone.

## Rollback (Release Manager with the owning area)

1. Announce the rollback in the incident channel and record the decision and
   time in the change record.
2. Restore the last known-good backend and client artifacts first. Follow the
   [Deployment/Release Failure runbook](./RUNBOOKS.md) for diagnosis.
3. Revert a migration only when the Backend Owner has confirmed it is safe and
   tested. Otherwise leave the schema forward and roll back the application.
4. Roll back a contract upgrade only through the timelocked procedure in the
   [Contract Deployment Runbook](./CONTRACT_DEPLOYMENT_RUNBOOK.md).
5. Re-run the smoke tests against the restored version and confirm alerts are
   quiet before closing the incident.
6. Record the outcome and any follow-up owners in the incident report described
   by [Incident Response](./INCIDENT_RESPONSE.md).

## After the release

- Support Owner posts the operator and customer notice and starts the
  [post-launch review cadence](./POST_LAUNCH_REVIEW.md).
- Release Manager archives the change record and completes the release
  verification section of the [V1 launch readiness sign-off](../LAUNCH_READINESS.md).
- Platform Owner keeps dashboards and alerts under the review cadence for the
  first week.

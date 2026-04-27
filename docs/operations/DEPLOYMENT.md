# Production Deployment Guide

## Purpose
This guide describes the production deployment process for Traqora, including pre-flight checks, deployment steps, verification, rollback, and change management.

## Pre-flight Checklist
- [ ] Confirm branch is based on `main` and up to date with `upstream/main`
- [ ] Run unit and integration tests in backend and frontend
- [ ] Verify migrations are prepared and reviewed
- [ ] Confirm production environment variables are present and valid
- [ ] Validate secrets and credentials for PostgreSQL, Redis, Stellar, and wallet services
- [ ] Confirm monitoring and alerting are configured for the release
- [ ] Ensure backups are complete and verifiable before the release
- [ ] Communicate maintenance window to stakeholders

## Deployment Workflow
1. Review PR and release notes.
2. Merge into `main` only after approvals and successful CI.
3. Apply database migrations in a controlled window.
4. Deploy backend and frontend services.
5. Deploy any contract or chain-level changes separately.
6. Run smoke tests and verification checks.
7. Confirm alerts are green and user flows are healthy.

## Step-by-step Production Deployment

### 1. Prepare the release
- Confirm the deployment branch is built from latest `upstream/main`.
- Run `npm install` and `npm test` for backend and frontend.
- Review the change management checklist in `docs/operations/INCIDENT_RESPONSE.md`.

### 2. Validate infrastructure
- Confirm PostgreSQL and Redis are healthy.
- Validate Stellar RPC endpoints and wallet service connectivity.
- Ensure load balancers and DNS entries are correct.
- Check Grafana dashboards and Prometheus health targets.

### 3. Run database migrations
- Apply migrations in a maintenance window.
- Use the migration tool configured for the backend.
- Confirm schema changes with a quick validation query.
- If rollback is needed, follow the rollback steps below.

### 4. Deploy backend services
- Deploy backend services to the production cluster.
- Start the application with the production environment configuration.
- Confirm backend health endpoint: `GET /health`

### 5. Deploy frontend services
- Deploy the Next.js frontend to the production environment.
- Confirm site load, authentication flows, and search pages.

### 6. Run smoke tests
- Verify user login and wallet connection.
- Perform a sample booking flow in staging or canary if available.
- Confirm contract calls are processed successfully.
- Validate payment and refund workflows.

### 7. Post-deployment verification
- Confirm production monitoring is green.
- Check error logs for unusual warnings.
- Confirm traffic is routed to healthy instances only.
- Review the `traqora` dashboards in Grafana.

## Rollback Plan
- If the release introduces critical failures, pause traffic and rollback to the last known-good version.
- Revert migrations only if that is safe and tested.
- Alternative rollback: disable the new service deployment and restore the previous container image.
- Document rollback decisions in the incident report.

## Change Management & Approval Workflow
1. Create a PR with clear release notes and testing evidence.
2. Obtain approvals from engineering and operations stakeholders.
3. Confirm release readiness in the PR checklist.
4. Schedule the deployment with a communication plan.
5. After deployment, perform a post-deployment review and update release notes.

## Production Readiness Requirements
- Health checks configured for backend and blockchain services.
- Error and performance alerts active in Prometheus and Grafana.
- Backup jobs scheduled and verified daily.
- Incident response on-call rotation assigned.

## Post-deployment Checklist
- [ ] Confirm all health endpoints return `200`
- [ ] Verify database replication and backups
- [ ] Confirm Redis persistence and cache health
- [ ] Validate contract transaction metrics
- [ ] Monitor payment and booking flows for 15 minutes
- [ ] Confirm no new critical alerts fired

## Notes
- Local development instructions remain in `DOCKER_SETUP.md`.
- Production deployment assumes Kubernetes, Docker Compose, or the configured production workflow already exists.
- Update this guide whenever new production infrastructure or services are added.

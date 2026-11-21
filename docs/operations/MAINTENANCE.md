# Maintenance Procedures

## Purpose
This document defines recurring maintenance operations, backup and recovery procedures, log management, and system health practices.

## Backup and Recovery
### Backup Schedule
- PostgreSQL: encrypted full backup nightly; archive transaction logs at least hourly.
- Redis: snapshot every 4 hours and append-only file persistence.
- Application config and secrets: record changes after each update and retain encrypted recovery copies in the approved secret manager; never store secrets in source control.
- Contract artifacts and deployment manifests: version-controlled backups.

These intervals are the v1 operational targets. This repository does not schedule production backups or provide backup storage; operators must configure those controls with their hosting provider.

### Backup Retention
- Full database backups: retain for 30 days.
- WAL / transaction log archives: retain for 7 days.
- Redis snapshots: retain for 7 days.
- Logs and audit trails: retain for 90 days by default.

### Recovery Verification Tests
- Run a restore drill weekly in a controlled, isolated environment.
- CI runs `bash packages/backend/scripts/verify-postgres-restore.sh` against a local PostgreSQL service. It generates a synthetic relational users/flights/bookings dataset, dumps it, restores it into a separate temporary database, and validates row counts and relationships.
- Restore the latest production backup into isolated staging at least weekly; do not restore production data to developer machines.
- Validate schema, key table counts, referential integrity, and basic application connectivity after each production-backup drill.
- Use only sanitized or synthetic records for routine tests; production backups contain personal and booking data and require access controls.

### Recovery Procedure
1. Identify the latest verified backup.
2. Restore PostgreSQL to staging or production as required.
3. Replay WAL logs if needed to reach the desired recovery point.
4. Validate schema and data integrity.
5. Bring application services back online and monitor.

## Log Management and Retention
- Centralized logs should be retained for 90 days.
- Critical alerts and audit logs should be stored for 365 days.
- Rotate logs daily or when a file reaches 100MB.
- Use structured logs for backend services with request IDs.
- Archive logs to long-term storage for compliance and forensics.

## Database Optimization
- Monitor slow queries and add indexes only after analysis.
- Run VACUUM and ANALYZE for PostgreSQL maintenance.
- Review query plans for expensive operations monthly.
- Use connection pooling to avoid excessive DB connections.

## Cache and Redis Maintenance
- Monitor Redis memory usage and eviction events.
- Verify RDB snapshots and AOF persistence are healthy.
- Restart Redis during low-traffic windows only.
- Test cache warming after Redis failover or restore.

## Capacity and Scaling Procedures
### Adding Backend Instances
- Deploy additional backend replicas behind the load balancer.
- Ensure session state is stored centrally or stateless.
- Verify horizontal autoscaling policies if enabled.

### Database Scaling
- Review read replicas for read-heavy workload scaling.
- Use partitioning or sharding only after profiling query patterns.
- Plan capacity changes with a maintenance window.

## Scheduled Maintenance Protocols
- Announce maintenance windows at least 24 hours in advance.
- Document expected impact and rollback plans.
- Monitor service health during and after maintenance.
- Notify stakeholders when maintenance is complete.

## Preventive Maintenance
- Review Grafana dashboards weekly for trends.
- Run database index audits monthly.
- Review alert thresholds quarterly.
- Conduct disaster recovery drills every 6 months.

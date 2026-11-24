# Production access review (v1)

This process governs operator access to Traqora production systems that can affect live booking, payment, refund, notification, and operational data. It is scoped to v1 operational needs and favors least privilege, traceability, and periodic review.

## Scope

Production systems in scope:

- Application hosting and deployment controls for backend/frontend services
- Production databases and caches (read/write access, exports, migrations)
- Payment/refund providers and operational dashboards (Stripe, Soroban/on-chain tooling, notification providers)
- Cloud/admin consoles, secret managers, CI/CD environments, and observability tools containing sensitive data
- Admin/API credentials and service accounts used by operations

Out of scope: end-user product access, non-production sandboxes except where they hold production-equivalent secrets or can promote changes to production.

## Access principles

- **Least privilege:** grant the minimum role and scope required for the task and duration.
- **Separation of duties:** no single operator should be able to deploy, approve, and silently audit their own sensitive production changes without review where feasible.
- **Named accounts only:** no shared human accounts. Service accounts must have an accountable owner and documented purpose.
- **Time-bounded elevation:** prefer temporary/admin-on-demand access for high-risk actions; revoke immediately after use.
- **Traceability:** all production access and sensitive actions must be attributable to a person/service and logged where the platform supports it.

## Roles and accountability

| Role | Responsibility | Accountable owner |
| --- | --- | --- |
| Engineering lead / on-call lead | Approves emergency access, validates technical necessity, ensures post-incident cleanup | Engineering lead (primary), CTO/Head of Engineering (backup) |
| Operations/platform owner | Maintains access inventory, executes grants/revocations in infra/provider consoles, runs scheduled reviews | Platform/DevOps owner |
| Security/privacy reviewer | Reviews high-risk access requests, validates logging/auditability, participates in quarterly review | Security lead or designated reviewer |
| Requesting operator | Requests only needed access, follows runbooks, reports completion and anomalies | Individual operator and their manager/lead |

For each system, the access inventory must record: system, account/service identity, role/permissions, business justification, approver, grant date, review date, and revocation/expiry condition.

## Granting access

1. **Request:** operator submits a request (ticket/issue) identifying system(s), exact role/permissions, reason, start/end time (or ongoing justification), and accountable owner.
2. **Approval:** 
   - Standard access: approved by engineering lead/on-call lead and platform owner.
   - High-risk access (production DB write, secret rotation/export, payment/refund admin, user data export, break-glass): approved by engineering lead plus security/privacy reviewer (or delegated approver) before grant, except emergencies.
3. **Provisioning:** platform owner provisions named, least-privilege access; enables MFA where supported; records grant in access inventory.
4. **Verification:** requester confirms access works only for intended scope and reports any over-permissioning for immediate correction.

**Emergency/break-glass:** may be granted by on-call lead to restore service or contain incidents; must be time-bounded, logged, and retrospectively reviewed within 1 business day with security/platform owners. Any unnecessary permissions are revoked during that review.

## Reviewing access

- **Cadence:** quarterly access review for all in-scope production systems, plus an ad-hoc review after incidents, personnel changes, contractor offboarding, or major architecture/provider changes.
- **Review checklist:** confirm each account is still required, role is least-privilege, MFA/audit logging enabled, owner and justification current, dormant accounts removed, and service-account secrets rotated per policy.
- **Evidence:** retain review records (date, reviewers, systems reviewed, changes made, exceptions and remediation dates) in the operations tracker/repository designated by the team.
- **Escalation:** unresolved excessive access or missing auditability is treated as a security/operational risk and escalated to engineering and security leadership with a remediation deadline.

## Revoking access

- **Immediate triggers:** offboarding, role change, end of contract/task, suspected compromise, policy violation, or completion of emergency access.
- **Execution:** platform owner (or delegated admin) revokes console/app/provider access, rotates affected shared secrets/tokens/keys, invalidates sessions/API keys where possible, and removes group memberships.
- **Verification:** confirm revocation in the target system and update the access inventory with revocation date, actor, and any follow-up actions.
- **Post-revocation checks:** for sensitive access, review audit logs for unexpected activity during the access window and document findings.

## Logging and auditability

- Prefer systems with immutable/admin audit logs; export or retain logs according to operational policy.
- Production data access (queries/exports/support actions) should be performed through approved tools with accountable identities.
- Document exceptions when a system cannot provide sufficient logging and apply compensating controls (time-bounded access, peer review, ticketed actions).

## v1 follow-ups (tracked separately)

- Centralize access inventory automation and alerting for dormant/high-privilege accounts.
- Enforce SSO/MFA uniformly across all providers where currently unavailable.
- Add automated evidence collection for quarterly reviews.

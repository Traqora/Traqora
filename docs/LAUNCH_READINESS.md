# V1 Launch Readiness Sign-off

This record collects accountable sign-off across the five V1 release areas. It
confirms that the documented V1 outcome is implemented without expanding scope,
that the relevant automated checks are green, and that security, privacy and
accessibility requirements for the touched surfaces are preserved. It does not
restate the detailed evidence; it points to the record where each area keeps
that evidence.

A release may proceed only when every row below is signed and the release
verification decision is GO. A NO-GO in any area stops the release, and the
blocker is recorded in the area's source document before sign-off is requested.

## Scope statement

V1 is the scope recorded in the release change record and the linked V1 change
sets. A sign-off confirms that scope is complete and that no additional feature
or service has been added to the release. If a reviewer identifies new scope,
the Release Manager either removes it from the release or obtains a new scope
decision before asking for sign-off again.

## Sign-off matrix

| Area | Accountable role | What is being signed | Evidence | Decision | Signature and date |
| --- | --- | --- | --- | --- | --- |
| Product | Product owner | Documented V1 outcome delivered, no scope expansion | Release change record and PR list | GO / NO-GO | |
| Security | Security Owner | Security and privacy review complete, blockers resolved or accepted | [V1 Security and Privacy Release Review](./security/V1_RELEASE_REVIEW.md) | GO / NO-GO | |
| Operations | Platform Owner | Deployment, configuration, monitoring and rollback ready | [V1 Operator Deployment Runbook](./operations/V1_DEPLOYMENT_RUNBOOK.md), [Production Deployment Checklist](./DEPLOYMENT_CHECKLIST.md) | GO / NO-GO | |
| Support | Support Owner | Operator notice, booking lookup and escalation path ready | [Post-Launch Monitoring and Review Cadence](./operations/POST_LAUNCH_REVIEW.md), [Operations Runbooks](./operations/RUNBOOKS.md) | GO / NO-GO | |
| Release verification | Release Manager and QA Owner | CI checks green, focused suites pass, smoke and rollback verified | [CI workspace checks test](../packages/backend/tests/security/ciWorkspaceChecks.test.ts), [Smoke checklist](./operations/smoke-checklist.md), [V1 Operator Deployment Runbook](./operations/V1_DEPLOYMENT_RUNBOOK.md) | GO / NO-GO | |

## Required checks before asking for sign-off

- [ ] The release branch is based on the latest `upstream/main`.
- [ ] The change record lists every PR in the release and no out-of-scope work.
- [ ] CI is green for lint, typecheck, unit tests and build in both the backend
      and client workspaces. The check contract is locked by
      `packages/backend/tests/security/ciWorkspaceChecks.test.ts`.
- [ ] Focused suites pass for every touched area, and any remaining broader
      test failures are triaged with named owners in the release verification
      record.
- [ ] Security and privacy findings are closed or explicitly accepted with an
      owner and a target date in the [security review](./security/V1_RELEASE_REVIEW.md).
- [ ] The deployment runbook, smoke checklist and rollback drill have been
      walked through, with results recorded.
- [ ] User-facing or operational documentation is updated for every behaviour
      change in the release.
- [ ] Accessibility requirements are confirmed for any touched UI surface. A
      release with no UI changes records that explicitly.

## Failure paths

A missing signature is a NO-GO, not a blank to be filled in at deploy time. A
sign-off older than the release commit must be renewed by the same role. If a
reviewer changes a decision after sign-off, the Release Manager reopens this
record, records the reason in the relevant evidence document and recollects the
affected signatures.

The security review documents its own blockers and conditions to flip from
NO-GO to GO. This matrix does not override that decision; it records that the
Security Owner has read it and accepted the outcome.

## Sign-off

Release identifier: ____________________  Release commit: ____________________

Release Manager: ____________________  Date: ____________

Final decision: GO / NO-GO  Reason if NO-GO: ______________________________

Once signed, attach this record to the release PR and link it from the post
launch review described in the
[post-launch cadence](./operations/POST_LAUNCH_REVIEW.md).

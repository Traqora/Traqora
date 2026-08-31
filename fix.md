548 Add admin overview endpoint for refunds and disputes
Repo Avatar
Traqora/Traqora
Title
Add admin overview endpoint for refunds and disputes

Summary
Improvement to the Node/Express backend layer.

Context
Traqora is a decentralized travel-booking platform built on the Stellar ecosystem: Soroban smart contracts handle booking, refunds, disputes and loyalty, with a Node/Express backend and a React client. This is a contributor-friendly task for the community. Please ask in the discussion before starting and reference this issue in your PR.

Task
Add an admin-only endpoint aggregating refund/dispute status bucketed by state, with counts and recent items, for internal dashboards.

Suggested files / areas
packages/backend/src/api/routes/admin.ts, packages/backend/src/repositories

Acceptance Criteria
 Behaviour is covered by unit/integration tests
 Idempotency and error handling are preserved
 Types/validation follow existing conventions
Difficulty: Medium
This issue is ideal for a first-time contributor. Comment to claim it and maintainers will assign you.


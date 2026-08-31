#543 Validate ancillary availability before purchase
Repo Avatar
Traqora/Traqora
Title
Validate ancillary availability before purchase

Summary
Improvement to the Node/Express backend layer.

Context
Traqora is a decentralized travel-booking platform built on the Stellar ecosystem: Soroban smart contracts handle booking, refunds, disputes and loyalty, with a Node/Express backend and a React client. This is a contributor-friendly task for the community. Please ask in the discussion before starting and reference this issue in your PR.

Task
When an ancillary is purchased, verify it is still available for that booking in ancillaryService and reject stale offers gracefully.

Suggested files / areas
packages/backend/src/services/ancillaryService.ts, packages/backend/src/api/routes/ancillary.ts

Acceptance Criteria
 Behaviour is covered by unit/integration tests
 Idempotency and error handling are preserved
 Types/validation follow existing conventions
Difficulty: Medium
This issue is ideal for a first-time contributor. Comment to claim it and maintainers will assign you.
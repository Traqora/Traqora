#542 Add concurrency tests for the idempotency key store
Repo Avatar
Traqora/Traqora
Title
Add concurrency tests for the idempotency key store

Summary
Improvement to the Node/Express backend layer.

Context
Traqora is a decentralized travel-booking platform built on the Stellar ecosystem: Soroban smart contracts handle booking, refunds, disputes and loyalty, with a Node/Express backend and a React client. This is a contributor-friendly task for the community. Please ask in the discussion before starting and reference this issue in your PR.

Task
Write tests that concurrent requests with the same idempotency key yield one execution and one stored result; probe race behaviour in the idempotency cache/DB store.

Suggested files / areas
packages/backend/src/services/idempotency.ts, packages/backend/src/db/entities/IdempotencyKey.ts

Acceptance Criteria
 Behaviour is covered by unit/integration tests
 Idempotency and error handling are preserved
 Types/validation follow existing conventions
Difficulty: Medium
This issue is ideal for a first-time contributor. Comment to claim it and maintainers will assign you.



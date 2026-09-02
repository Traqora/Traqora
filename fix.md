#545 Add group-booking seat-pool consistency checks
Repo Avatar
Traqora/Traqora
Title
Add group-booking seat-pool consistency checks

Summary
Improvement to the Node/Express backend layer.

Context
Traqora is a decentralized travel-booking platform built on the Stellar ecosystem: Soroban smart contracts handle booking, refunds, disputes and loyalty, with a Node/Express backend and a React client. This is a contributor-friendly task for the community. Please ask in the discussion before starting and reference this issue in your PR.

Task
Guarantee group booking holds use the same seat pool as individual holds so groups cannot overcommit capacity, with tests for mixed group/individual loads.

Suggested files / areas
packages/backend/src/services/groupBooking.ts, packages/backend/src/services/seatAvailabilityService.ts

Acceptance Criteria
 Behaviour is covered by unit/integration tests
 Idempotency and error handling are preserved
 Types/validation follow existing conventions
Difficulty: Hard
This issue is ideal for a first-time contributor. Comment to claim it and maintainers will assign you.



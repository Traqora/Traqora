
Add metadata and status fields to flight_registry

Summary
Improvement to the Soroban smart-contract layer.

Context
Traqora is a decentralized travel-booking platform built on the Stellar ecosystem: Soroban smart contracts handle booking, refunds, disputes and loyalty, with a Node/Express backend and a React client. This is a contributor-friendly task for the community. Please ask in the discussion before starting and reference this issue in your PR.

Task
Extend flight registration to carry richer metadata (status, schedule, seats) and expose a read path, keeping the existing storage patterns and emitting events on update.

Suggested files / areas
contracts/packages/flight_registry

Acceptance Criteria
 Tests are added and pass (cargo test / relevant harness)
 Contract behaviour is deterministic and safe
 Existing contracts/abilities are not regressed
Difficulty: Medium
This issue is ideal for a first-time contributor. Comment to claim it and maintainers will assign you.
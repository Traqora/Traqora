#508 Add admin contract privilege-check tests
Repo Avatar
Traqora/Traqora
Title
Add admin contract privilege-check tests

Summary
Improvement to the Soroban smart-contract layer.

Context
Traqora is a decentralized travel-booking platform built on the Stellar ecosystem: Soroban smart contracts handle booking, refunds, disputes and loyalty, with a Node/Express backend and a React client. This is a contributor-friendly task for the community. Please ask in the discussion before starting and reference this issue in your PR.

Task
Cover the admin contract with tests asserting that only authorised callers can add/remove admins, pause/resume, and that actions emit the canonical admin events described in contracts/EVENTS.md.

Suggested files / areas
contracts/packages/admin

Acceptance Criteria
 Tests are added and pass (cargo test / relevant harness)
 Contract behaviour is deterministic and safe
 Existing contracts/abilities are not regressed
Difficulty: Easy
This issue is ideal for a first-time contributor. Comment to claim it and maintainers will assign you.



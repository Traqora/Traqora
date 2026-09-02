#507 Add unit tests for flight_booking contract edge cases
Repo Avatar
Traqora/Traqora
Title
Add unit tests for flight_booking contract edge cases

Summary
Improvement to the Soroban smart-contract layer.

Context
Traqora is a decentralized travel-booking platform built on the Stellar ecosystem: Soroban smart contracts handle booking, refunds, disputes and loyalty, with a Node/Express backend and a React client. This is a contributor-friendly task for the community. Please ask in the discussion before starting and reference this issue in your PR.

Task
Cover the flight_booking contract with unit tests: double booking, cancelled flights, non-existent flight ids, capacity overflow, and auth failure paths. Use the existing test harness used by sibling packages.

Suggested files / areas
contracts/packages/flight_booking, contracts/src

Acceptance Criteria
 Tests are added and pass (cargo test / relevant harness)
 Contract behaviour is deterministic and safe
 Existing contracts/abilities are not regressed
Difficulty: Medium
This issue is ideal for a first-time contributor. Comment to claim it and maintainers will assign you.
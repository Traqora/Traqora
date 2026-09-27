#510 Support partial refunds in the refund contract
Repo Avatar
Traqora/Traqora
Title
Support partial refunds in the refund contract

Summary
Improvement to the Soroban smart-contract layer.

Context
Traqora is a decentralized travel-booking platform built on the Stellar ecosystem: Soroban smart contracts handle booking, refunds, disputes and loyalty, with a Node/Express backend and a React client. This is a contributor-friendly task for the community. Please ask in the discussion before starting and reference this issue in your PR.

Task
Implement partial refunds in contracts/packages/refund so a booking can be refunded in multiple transactions, with idempotency guarding against double-settlement.

Suggested files / areas
contracts/packages/refund

Acceptance Criteria
 Tests are added and pass (cargo test / relevant harness)
 Contract behaviour is deterministic and safe
 Existing contracts/abilities are not regressed
Difficulty: Hard
This issue is ideal for a first-time contributor. Comment to claim it and maintainers will assign you.

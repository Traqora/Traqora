#685 Configurable quorum
Repo Avatar
Traqora/Traqora
Description
Configurable quorum: implement this scoped Traqora capability with a narrow, reviewable change. Start from current behavior in contracts governance, define the contract, implement the minimal fix, and cover it with regression tests plus docs.

Relevant area/files: contracts governance.

Scope
In scope: one capability, contract definition, implementation, tests, docs
Out of scope: unrelated refactors or cross-cutting redesigns
Acceptance criteria
 Behavior specified with inputs, outputs, and error cases
 Minimal implementation merged behind existing conventions
 Regression tests cover happy path + key failure mode
 Docs or examples updated for operators/contributors
Testing
Unit/integration tests per area (npm run test, soroban test, workspace lint). Include at least one failure-mode test.
Description
Evidence timeouts voting: implement this scoped Traqora capability with a narrow, reviewable change. Start from current behavior in contracts disputes, define the contract, implement the minimal fix, and cover it with regression tests plus docs.

Relevant area/files: contracts disputes.

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






When you're done with the above and it good to go
fill this pr message:
# Pull Request

## Summary
<!-- Provide a clear, concise summary of the changes proposed in this PR. -->
Adds a permissionless `advance_to_voting(dispute_id)` entrypoint to the `dispute`
contract so a dispute that has reached its evidence deadline can be advanced out
of the `Evidence` phase into `JurySelection`, unblocking jury seating and
commit-reveal voting. Previously this transition only happened lazily inside
`select_as_juror`, which could leave a dispute stuck in `Evidence` if the
evidence period elapsed before the jury was seated. The new entrypoint mirrors
the existing `advance_to_reveal` pattern.

Contract definition:
- Inputs: `advance_to_voting(env, dispute_id: u64)` — no auth required.
- Outputs: none; mutates the dispute phase from `Evidence` to `JurySelection`
  and emits `(phase, voting)` with `dispute_id`.
- Errors: `"Dispute not found"` if the id does not exist;
  `"Not in evidence phase"` if the dispute is not currently in `Evidence`;
  `"Evidence period not ended"` if called on or before `evidence_deadline`.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [x] New feature (non-breaking change which adds capability)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update (changes to docs or inline comments)
- [ ] Code refactoring or performance improvement

## Related Issues
<!-- Reference related issues, e.g., Closes #123 or Fixes #456 -->
Closes #

## Guidelines & Verification Checklist
Before submitting this PR, please review and confirm the following guidelines:
- [x] I have read and followed the [Contributing Guide](CONTRIBUTING.md).
- [x] I have adhered to the project's [Code of Conduct](CODE_OF_CONDUCT.md).
- [x] I have reviewed the [Security Policy](SECURITY.md) if this PR impacts sensitive code.
- [x] New and existing unit and integration tests pass locally.
- [x] Code has been formatted and linted according to repository standards.

## Testing Details
<!-- Describe the tests you ran to verify your changes. Include commands used and key test outputs. -->
Added three regression tests to
`contracts/packages/integration-tests/tests/dispute_test.rs`:
- `test_advance_to_voting_after_evidence_timeout` — happy path: after the
  evidence deadline elapses the dispute moves to `JurySelection`, then seating
  the full jury transitions it to `CommitVote`.
- `test_advance_to_voting_before_timeout_panics` — failure mode: calling before
  the deadline panics with `"Evidence period not ended"`.
- `test_advance_to_voting_wrong_phase_panics` — failure mode: calling after the
  dispute has already advanced panics with `"Not in evidence phase"`.

Documentation updated in `contracts/packages/dispute/src/README.md` (phase flow,
function reference, usage example, event list) and `contracts/EVENTS.md`
(`(phase, voting)` event).

```bash
cargo test -p integration-tests --test dispute_test   # 18 passed, 0 failed
cargo fmt --check                                      # clean
cargo clippy -p dispute -p integration-tests -- -D warnings  # clean
```



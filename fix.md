Description
Gas snapshot per release: implement this scoped Traqora capability with a narrow, reviewable change. Start from current behavior in contracts gas snapshot, define the contract, implement the minimal fix, and cover it with regression tests plus docs.

Relevant area/files: contracts gas snapshot.

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

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds capability)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update (changes to docs or inline comments)
- [ ] Code refactoring or performance improvement

## Related Issues
<!-- Reference related issues, e.g., Closes #123 or Fixes #456 -->
Closes #

## Guidelines & Verification Checklist
Before submitting this PR, please review and confirm the following guidelines:
- [ ] I have read and followed the [Contributing Guide](CONTRIBUTING.md).
- [ ] I have adhered to the project's [Code of Conduct](CODE_OF_CONDUCT.md).
- [ ] I have reviewed the [Security Policy](SECURITY.md) if this PR impacts sensitive code.
- [ ] New and existing unit and integration tests pass locally.
- [ ] Code has been formatted and linted according to repository standards.

## Testing Details
<!-- Describe the tests you ran to verify your changes. Include commands used and key test outputs. -->

```bash
npm run test
npm run lint
```


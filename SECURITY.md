# Security Policy

## Supported Versions

The following versions of Traqora are currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

We take the security of Traqora seriously. If you believe you have found a security vulnerability in Traqora, please report it to us as soon as possible.

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to [security@traqora.com](mailto:security@traqora.com).

### What to include in your report:

- A descriptive title for the vulnerability.
- A detailed description of the vulnerability.
- Steps to reproduce the issue (proof of concept).
- Any potential impact of the vulnerability.
- Your contact information (optional but recommended).

### Our Response Process:

1. **Acknowledgment**: We will acknowledge receipt of your report within 48 hours.
2. **Investigation**: We will investigate the issue and determine its severity and impact.
3. **Fix**: We will work on a fix and test it thoroughly.
4. **Disclosure**: We will coordinate with you to disclose the vulnerability and the fix in a responsible manner.

## Security Scanning

Traqora uses automated security scanning tools to identify vulnerabilities:
- **Snyk**: Dependency and code scanning.
- **SonarCloud**: Static Application Security Testing (SAST).
- **Dependabot**: Automated dependency updates.

We recommend all contributors to run local security checks before submitting pull requests.

## Contract Audit Checklist

Smart-contract changes must be reviewed against this checklist and the [penetration testing plan](PENTEST_PLAN.md) before merge.

- [ ] **Access control** — owner/admin/operator roles cannot be assumed by an unauthenticated caller
- [ ] **Upgrade timelock** — WASM upgrades wait at least 48 hours and cannot skip the delay
- [ ] **Integer / overflow safety** — checked arithmetic on balances, shares, and timestamps
- [ ] **Authorization** — every mutating entrypoint requires the expected Soroban auth
- [ ] **Event completeness** — schedule, execute, cancel, and timelock changes emit events
- [ ] **Coverage gate** — `cargo llvm-cov --fail-under-lines 90` stays green

Operators should also follow `PENTEST_PLAN.md` for API, frontend, and infrastructure scope.

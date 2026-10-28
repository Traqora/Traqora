# Gitleaks Secret Scan Gate Contract & Operations

## Overview
Traqora employs a Gitleaks secret scan gate in CI (`.github/workflows/gitleaks.yml`) driven by `.gitleaks.toml` configuration to prevent secret regressions.

## Contract & Behavior
- **Inputs**: Pull requests or pushes containing repository source files and commit histories.
- **Outputs**: 
  - Exit code `0` on successful scan (no unallowlisted secrets detected).
  - Non-zero exit code on failure with stdout detailing the rule violation, commit hash, file path, and line number.
- **Error Cases**: 
  - Secret detected in working tree or commit history -> Scan fails and blocks PR merge.
  - Malformed `.gitleaks.toml` -> Gitleaks parser aborts with configuration error.

## Operator Usage
Run the scan locally using the Gitleaks CLI:
```bash
gitleaks detect --source=. --verbose --redact
```

/**
 * CI security controls contract (issue #1184).
 *
 * The secret-scan and dependency-audit controls already ship in this repo
 * (`.github/workflows/gitleaks.yml`, `.github/workflows/security-audit.yml`,
 * `scripts/audit/audit-deps.sh`). These assertions keep those controls from
 * silently disappearing or being weakened: a future edit that drops the
 * redaction flag, loosens the audit level, or removes the self-test fails here
 * with a clear message instead of reducing the V1 security posture unnoticed.
 */
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');

describe('CI secret-scan control (issue #1184)', () => {
  const workflow = readFile('.github/workflows/gitleaks.yml');
  const config = readFile('.gitleaks.toml');

  test('gitleaks runs on pull requests and pushes to main', () => {
    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
  });

  test('the scanner is pinned to a fixed version', () => {
    expect(workflow).toMatch(/GITLEAKS_VERSION=\d+\.\d+\.\d+/);
  });

  test('findings are redacted so secrets are not echoed into CI logs', () => {
    expect(workflow).toMatch(/gitleaks detect[^;]*--redact/);
  });

  test('the repo versioned config is used for both history and working tree', () => {
    expect(workflow).toMatch(/--config \.gitleaks\.toml/);
    expect(workflow).toMatch(/--no-git/);
  });

  test('the config runs in strict mode with narrowly scoped allowlists', () => {
    expect(config).toMatch(/strict\s*=\s*true/);
    // No path-wide glob allowlist that would suppress whole directories.
    expect(config).not.toMatch(/paths\s*=\s*\[\s*['"]\*/);
  });
});

describe('CI dependency-audit control (issue #1184)', () => {
  const workflow = readFile('.github/workflows/security-audit.yml');
  const runner = readFile('scripts/audit/audit-deps.sh');

  test('a dependency audit job runs on a schedule and can be dispatched', () => {
    expect(workflow).toMatch(/schedule:/);
    expect(workflow).toMatch(/workflow_dispatch:/);
  });

  test('the runner fails on high-severity vulnerabilities by default', () => {
    expect(runner).toMatch(/AUDIT_LEVEL="\$\{AUDIT_LEVEL:-high\}"/);
  });

  test('the runner self-test gates the job before audits execute', () => {
    expect(workflow).toMatch(/audit-deps\.sh --self-test/);
    expect(runner).toMatch(/--self-test/);
  });

  test('both npm and cargo ecosystems are audited', () => {
    expect(workflow).toMatch(/AUDIT_TARGETS=npm/);
    expect(workflow).toMatch(/AUDIT_TARGETS=cargo/);
  });

  test('a non-zero audit exit code fails the workflow step', () => {
    // No continue-on-error on the audit invocation steps, so a high-severity
    // finding blocks the job rather than being silently reported.
    const auditSteps = workflow.split('name:').filter((section) =>
      /AUDIT_TARGETS=|audit-deps\.sh/.test(section)
    );
    expect(auditSteps.length).toBeGreaterThan(0);
    for (const step of auditSteps) {
      expect(step).not.toMatch(/continue-on-error:\s*true/);
    }
  });
});

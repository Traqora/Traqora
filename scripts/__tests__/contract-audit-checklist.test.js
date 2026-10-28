'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertContractAuditChecklist } = require('../assert-contract-audit-checklist');

const ROOT = path.join(__dirname, '..', '..');

describe('contract audit checklist', () => {
  it('finds the checklist and pentest plan on the real repo', () => {
    const result = assertContractAuditChecklist(ROOT);
    assert.equal(result.ok, true, result.errors.join('; '));
  });

  it('fails when SECURITY.md omits the checklist', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
    fs.writeFileSync(path.join(tmp, 'SECURITY.md'), '# Security\n');
    fs.writeFileSync(path.join(tmp, 'PENTEST_PLAN.md'), '# Pentest\n');
    const result = assertContractAuditChecklist(tmp);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /Contract Audit Checklist/.test(error)));
  });
});

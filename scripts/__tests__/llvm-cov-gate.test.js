'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertLlvmCovGate, MIN_LINE_COVERAGE } = require('../assert-llvm-cov-gate');

const ROOT = path.join(__dirname, '..', '..');

describe('90pct llvm-cov coverage gate', () => {
  it('locks the repo gate at 90 percent', () => {
    const result = assertLlvmCovGate(ROOT);
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal(result.minLineCoverage, MIN_LINE_COVERAGE);
  });

  it('fails when CI drops the line-coverage threshold', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'llvm-cov-'));
    fs.mkdirSync(path.join(tmp, 'contracts'));
    fs.mkdirSync(path.join(tmp, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'contracts', 'coverage.sh'), 'DEFAULT_THRESHOLD=90\n--fail-under-lines "$THRESHOLD"\n');
    fs.writeFileSync(
      path.join(tmp, '.github', 'workflows', 'ci.yml'),
      'run: cargo llvm-cov --summary-only --fail-under-lines 10\n',
    );
    const result = assertLlvmCovGate(tmp);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /90%/.test(error)));
  });
});

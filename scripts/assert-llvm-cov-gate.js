'use strict';

const fs = require('fs');
const path = require('path');

const MIN_LINE_COVERAGE = 90;

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertLlvmCovGate(rootDir) {
  const errors = [];
  const coverageSh = path.join(rootDir, 'contracts', 'coverage.sh');
  const ciYml = path.join(rootDir, '.github', 'workflows', 'ci.yml');

  if (!fs.existsSync(coverageSh)) {
    errors.push('missing contracts/coverage.sh');
  } else {
    const text = read(coverageSh);
    if (!/DEFAULT_THRESHOLD=90/.test(text)) {
      errors.push('contracts/coverage.sh default threshold must remain 90');
    }
    if (!/--fail-under-lines 90/.test(text) && !/--fail-under-lines "\$THRESHOLD"/.test(text)) {
      errors.push('contracts/coverage.sh must pass --fail-under-lines to cargo llvm-cov');
    }
  }

  if (!fs.existsSync(ciYml)) {
    errors.push('missing .github/workflows/ci.yml');
  } else {
    const text = read(ciYml);
    if (!/--fail-under-lines 90/.test(text)) {
      errors.push('CI llvm-cov gate must fail under 90% line coverage');
    }
    if (!/cargo llvm-cov/.test(text)) {
      errors.push('CI must run cargo llvm-cov');
    }
  }

  return { ok: errors.length === 0, errors, minLineCoverage: MIN_LINE_COVERAGE };
}

function main() {
  const root = process.argv[2] || path.join(__dirname, '..');
  const result = assertLlvmCovGate(root);
  if (!result.ok) {
    console.error('90% llvm-cov coverage gate check failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`llvm-cov coverage gate is locked at ${result.minLineCoverage}%`);
}

if (require.main === module) {
  main();
}

module.exports = { assertLlvmCovGate, MIN_LINE_COVERAGE };

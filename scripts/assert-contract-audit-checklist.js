'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_ITEMS = [
  'Access control',
  'Upgrade timelock',
  'Integer / overflow safety',
  'Authorization',
  'Event completeness',
  'Coverage gate',
];

function assertContractAuditChecklist(rootDir) {
  const errors = [];
  const securityPath = path.join(rootDir, 'SECURITY.md');
  const pentestPath = path.join(rootDir, 'PENTEST_PLAN.md');

  if (!fs.existsSync(securityPath)) {
    errors.push('missing SECURITY.md');
  }
  if (!fs.existsSync(pentestPath)) {
    errors.push('missing PENTEST_PLAN.md');
  }

  if (fs.existsSync(securityPath)) {
    const text = fs.readFileSync(securityPath, 'utf8');
    if (!/Contract Audit Checklist/i.test(text)) {
      errors.push('SECURITY.md must include a Contract Audit Checklist');
    }
    if (!/PENTEST_PLAN\.md/.test(text)) {
      errors.push('SECURITY.md must link PENTEST_PLAN.md');
    }
    for (const item of REQUIRED_ITEMS) {
      if (!text.includes(item)) {
        errors.push(`checklist missing item: ${item}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, requiredItems: REQUIRED_ITEMS };
}

function main() {
  const root = process.argv[2] || path.join(__dirname, '..');
  const result = assertContractAuditChecklist(root);
  if (!result.ok) {
    console.error('Contract audit checklist check failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('Contract audit checklist is present in SECURITY.md');
}

if (require.main === module) {
  main();
}

module.exports = { assertContractAuditChecklist, REQUIRED_ITEMS };

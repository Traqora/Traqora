// scripts/__tests__/lint-contributing.test.js
//
// Regression tests for the CONTRIBUTING.md linter.
//
// Run:   node --experimental-vm-modules node_modules/.bin/jest scripts/__tests__/lint-contributing.test.js
// Or:    npm run test:contributing  (once the script is wired up)

'use strict';

const path = require('path');
const fs = require('fs');
const {
  lintContributing,
  extractNpmRunReferences,
  REQUIRED_SECTIONS,
  MAX_LINE_LENGTH,
} = require('../lint-contributing');

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal CONTRIBUTING.md that passes all checks. */
const VALID_CONTRIBUTING = `# Contributing to Traqora

## 🛠 Ways to Contribute

- Submit bug reports

## 📥 How to Submit a Pull Request (PR)

1. Fork the repo

## 📋 Code Guidelines

- Follow best practices

## 🧪 Testing

All contributions should be tested:

\`\`\`bash
npm run test
\`\`\`
`;

/** Content missing a required section. */
const MISSING_SECTION = `# Contributing

## 🛠 Ways to Contribute

- Submit bug reports

## 📥 How to Submit a Pull Request

1. Fork

## 📋 Code Guidelines

- Lint your code
`;

/** Content with an unclosed code fence. */
const UNCLOSED_FENCE = `# Contributing

## 🛠 Ways to Contribute
## 📥 Pull Request
## 📋 Code Guidelines
## 🧪 Testing

\`\`\`bash
npm run test
`;

/** Content with a code fence missing a language tag. */
const MISSING_LANG = `# Contributing

## 🛠 Ways to Contribute
## 📥 Pull Request
## 📋 Code Guidelines
## 🧪 Testing

\`\`\`
npm run lint
\`\`\`
`;

/** Content with a broken file:// link (placeholder path). */
const BROKEN_LINK = `# Contributing

## 🛠 Ways to Contribute
## 📥 Pull Request
## 📋 Code Guidelines
## 🧪 Testing

See [common.rs](file:///Users/ew/waves2/Traqora/contracts/tests/common.rs) for fixtures.
`;

/** Content referencing npm scripts that don't exist. */
const BAD_COMMAND = `# Contributing

## 🛠 Ways to Contribute
## 📥 Pull Request
## 📋 Code Guidelines
## 🧪 Testing

\`\`\`bash
npm run nonexistent-script
\`\`\`
`;

/** Content with trailing whitespace. */
const TRAILING_WS = `# Contributing

## 🛠 Ways to Contribute   
## 📥 Pull Request
## 📋 Code Guidelines
## 🧪 Testing
`;

// ── Test suites ─────────────────────────────────────────────────────────────

describe('lintContributing', () => {
  describe('happy path', () => {
    it('returns zero diagnostics for a valid CONTRIBUTING.md', () => {
      const diags = lintContributing(VALID_CONTRIBUTING, {
        availableScripts: new Set(['test', 'lint', 'build']),
      });
      const errors = diags.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  // ── required-sections ───────────────────────────────────────────────────
  describe('required-sections', () => {
    it('reports an error when a required section is missing', () => {
      const diags = lintContributing(MISSING_SECTION);
      const sectionErrors = diags.filter(
        (d) => d.rule === 'required-sections',
      );
      expect(sectionErrors.length).toBeGreaterThanOrEqual(1);
      // "Testing" section is missing
      expect(
        sectionErrors.some((d) => d.message.includes('Testing')),
      ).toBe(true);
      expect(sectionErrors[0].severity).toBe('error');
    });

    it('passes when all required sections are present', () => {
      const diags = lintContributing(VALID_CONTRIBUTING);
      const sectionErrors = diags.filter(
        (d) => d.rule === 'required-sections',
      );
      expect(sectionErrors).toHaveLength(0);
    });
  });

  // ── fenced-code-balance ─────────────────────────────────────────────────
  describe('fenced-code-balance', () => {
    it('reports an error for unclosed fenced code blocks', () => {
      const diags = lintContributing(UNCLOSED_FENCE);
      const fenceErrors = diags.filter(
        (d) => d.rule === 'fenced-code-balance',
      );
      expect(fenceErrors).toHaveLength(1);
      expect(fenceErrors[0].severity).toBe('error');
      expect(fenceErrors[0].message).toMatch(/unclosed/i);
    });

    it('passes when all fences are balanced', () => {
      const diags = lintContributing(VALID_CONTRIBUTING);
      const fenceErrors = diags.filter(
        (d) => d.rule === 'fenced-code-balance',
      );
      expect(fenceErrors).toHaveLength(0);
    });
  });

  // ── fenced-code-lang ────────────────────────────────────────────────────
  describe('fenced-code-lang', () => {
    it('warns when a code fence lacks a language specifier', () => {
      const diags = lintContributing(MISSING_LANG);
      const langWarnings = diags.filter(
        (d) => d.rule === 'fenced-code-lang',
      );
      expect(langWarnings).toHaveLength(1);
      expect(langWarnings[0].severity).toBe('warning');
    });
  });

  // ── no-broken-links ────────────────────────────────────────────────────
  describe('no-broken-links', () => {
    it('reports an error for placeholder file:// links', () => {
      const diags = lintContributing(BROKEN_LINK);
      const linkErrors = diags.filter(
        (d) => d.rule === 'no-broken-links',
      );
      expect(linkErrors).toHaveLength(1);
      expect(linkErrors[0].severity).toBe('error');
      expect(linkErrors[0].message).toMatch(/placeholder/i);
    });

    it('does not flag clean file:// links', () => {
      const clean = VALID_CONTRIBUTING + '\nSee [utils](file:///contracts/src/utils.rs)\n';
      const diags = lintContributing(clean);
      const linkErrors = diags.filter(
        (d) => d.rule === 'no-broken-links',
      );
      expect(linkErrors).toHaveLength(0);
    });
  });

  // ── command-reference ──────────────────────────────────────────────────
  describe('command-reference', () => {
    it('reports an error when npm run references a nonexistent script', () => {
      const diags = lintContributing(BAD_COMMAND, {
        availableScripts: new Set(['test', 'lint', 'build']),
      });
      const cmdErrors = diags.filter(
        (d) => d.rule === 'command-reference',
      );
      expect(cmdErrors).toHaveLength(1);
      expect(cmdErrors[0].severity).toBe('error');
      expect(cmdErrors[0].message).toMatch(/nonexistent-script/);
    });

    it('passes when all npm run commands map to real scripts', () => {
      const diags = lintContributing(VALID_CONTRIBUTING, {
        availableScripts: new Set(['test', 'lint', 'build']),
      });
      const cmdErrors = diags.filter(
        (d) => d.rule === 'command-reference',
      );
      expect(cmdErrors).toHaveLength(0);
    });

    it('skips command validation when availableScripts is not provided', () => {
      const diags = lintContributing(BAD_COMMAND);
      const cmdErrors = diags.filter(
        (d) => d.rule === 'command-reference',
      );
      expect(cmdErrors).toHaveLength(0);
    });
  });

  // ── no-trailing-whitespace ─────────────────────────────────────────────
  describe('no-trailing-whitespace', () => {
    it('warns about trailing whitespace', () => {
      const diags = lintContributing(TRAILING_WS);
      const wsWarnings = diags.filter(
        (d) => d.rule === 'no-trailing-whitespace',
      );
      expect(wsWarnings.length).toBeGreaterThanOrEqual(1);
      expect(wsWarnings[0].severity).toBe('warning');
    });
  });

  // ── max-line-length ────────────────────────────────────────────────────
  describe('max-line-length', () => {
    it('warns when a prose line exceeds the maximum length', () => {
      const longLine = '## 🛠 Ways to Contribute\n## 📥 Pull Request\n## 📋 Code Guidelines\n## 🧪 Testing\n' +
        'x'.repeat(MAX_LINE_LENGTH + 1) + '\n';
      const diags = lintContributing(longLine);
      const lenWarnings = diags.filter(
        (d) => d.rule === 'max-line-length',
      );
      expect(lenWarnings.length).toBeGreaterThanOrEqual(1);
      expect(lenWarnings[0].severity).toBe('warning');
    });

    it('does not warn for long lines inside code blocks', () => {
      const content = `## 🛠 Ways to Contribute
## 📥 Pull Request
## 📋 Code Guidelines
## 🧪 Testing

\`\`\`bash
${'x'.repeat(MAX_LINE_LENGTH + 50)}
\`\`\`
`;
      const diags = lintContributing(content);
      const lenWarnings = diags.filter(
        (d) => d.rule === 'max-line-length',
      );
      expect(lenWarnings).toHaveLength(0);
    });
  });
});

// ── extractNpmRunReferences ─────────────────────────────────────────────────

describe('extractNpmRunReferences', () => {
  it('extracts npm run commands from content lines', () => {
    const lines = [
      'First do `npm run lint`',
      'Then run npm run test:coverage for coverage',
      'No commands here',
    ];
    const refs = extractNpmRunReferences(lines);
    expect(refs).toEqual([
      { script: 'lint', line: 1 },
      { script: 'test:coverage', line: 2 },
    ]);
  });

  it('returns empty array when no commands exist', () => {
    const refs = extractNpmRunReferences(['no commands here', 'or here']);
    expect(refs).toEqual([]);
  });
});

// ── Integration: real CONTRIBUTING.md ───────────────────────────────────────

describe('real CONTRIBUTING.md integration', () => {
  const contributingPath = path.resolve(__dirname, '..', '..', 'CONTRIBUTING.md');

  it('file exists at the expected repo path', () => {
    expect(fs.existsSync(contributingPath)).toBe(true);
  });

  it('produces zero errors on the current CONTRIBUTING.md', () => {
    const content = fs.readFileSync(contributingPath, 'utf8');
    const diags = lintContributing(content);
    const errors = diags.filter((d) => d.severity === 'error');
    // After the fix, there should be no errors
    expect(errors).toHaveLength(0);
  });
});

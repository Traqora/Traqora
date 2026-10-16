// scripts/__tests__/lint-pr-template.test.js
//
// Regression tests for the PR template linter.
//
// Run: npx jest scripts/__tests__/lint-pr-template.test.js

'use strict';

const path = require('path');
const fs = require('fs');
const {
  lintPrTemplate,
  extractMarkdownLinks,
  REQUIRED_SECTIONS,
} = require('../lint-pr-template');

// ── Fixtures ────────────────────────────────────────────────────────────────

const repoRoot = path.resolve(__dirname, '..', '..');

/** Fully valid PR template content. */
const VALID_PR_TEMPLATE = `# Pull Request

## Summary
Implements feature enhancement.

## Type of Change
- [ ] Bug fix
- [x] New feature

## Related Issues
Closes #123

## Guidelines & Verification Checklist
- [ ] I have read the [Contributing Guide](CONTRIBUTING.md).
- [ ] I have followed the [Code of Conduct](CODE_OF_CONDUCT.md).
- [ ] I have reviewed the [Security Policy](SECURITY.md).

## Testing Details
\`\`\`bash
npm run test
\`\`\`
`;

/** Content missing required section. */
const MISSING_SECTION_TEMPLATE = `# Pull Request

## Summary
Some summary.

## Related Issues
Closes #123

## Checklist
- [ ] Done
`;

/** Content with nonexistent link target. */
const NONEXISTENT_LINK_TEMPLATE = `# Pull Request

## Summary
Test

## Type of Change
- [ ] Feature

## Related Issues
Closes #1

## Checklist
- [ ] Check [Nonexistent File](nonexistent-file-xyz.md)

## Testing Details
Done
`;

/** Content with placeholder URL link. */
const PLACEHOLDER_LINK_TEMPLATE = `# Pull Request

## Summary
Test

## Type of Change
- [ ] Feature

## Related Issues
Closes #1

## Checklist
- [ ] Check [Docs](file:///Users/dev/secret/doc.md)

## Testing Details
Done
`;

/** Content with unclosed fenced code block. */
const UNCLOSED_FENCE_TEMPLATE = `# Pull Request

## Summary
Test

## Type of Change
- [ ] Feature

## Related Issues
Closes #1

## Checklist
- [ ] Done

## Testing Details
\`\`\`bash
npm run test
`;

/** Content with malformed checklist items. */
const MALFORMED_CHECKLIST_TEMPLATE = `# Pull Request

## Summary
Test

## Type of Change
- [?] Feature
- [o] Bug fix

## Related Issues
Closes #1

## Checklist
- [ ] Done

## Testing Details
Done
`;

// ── Test suites ─────────────────────────────────────────────────────────────

describe('lintPrTemplate', () => {
  describe('happy path', () => {
    it('returns zero errors for a valid PR template', () => {
      const diags = lintPrTemplate(VALID_PR_TEMPLATE, { repoRoot });
      const errors = diags.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('required-sections', () => {
    it('reports an error when required sections are missing', () => {
      const diags = lintPrTemplate(MISSING_SECTION_TEMPLATE, { repoRoot });
      const sectionErrors = diags.filter((d) => d.rule === 'required-sections');
      expect(sectionErrors.length).toBeGreaterThanOrEqual(1);
      expect(sectionErrors.some((d) => d.message.includes('Type of Change'))).toBe(true);
      expect(sectionErrors.some((d) => d.message.includes('Testing'))).toBe(true);
    });
  });

  describe('valid-repo-links', () => {
    it('reports an error when a link targets a non-existent repo file', () => {
      const diags = lintPrTemplate(NONEXISTENT_LINK_TEMPLATE, { repoRoot });
      const linkErrors = diags.filter((d) => d.rule === 'valid-repo-links');
      expect(linkErrors).toHaveLength(1);
      expect(linkErrors[0].severity).toBe('error');
      expect(linkErrors[0].message).toMatch(/nonexistent-file-xyz\.md/);
    });

    it('passes for existing repo documentation files', () => {
      const diags = lintPrTemplate(VALID_PR_TEMPLATE, { repoRoot });
      const linkErrors = diags.filter((d) => d.rule === 'valid-repo-links');
      expect(linkErrors).toHaveLength(0);
    });
  });

  describe('no-placeholder-links', () => {
    it('reports an error for placeholder or file:// links', () => {
      const diags = lintPrTemplate(PLACEHOLDER_LINK_TEMPLATE, { repoRoot });
      const placeholderErrors = diags.filter((d) => d.rule === 'no-placeholder-links');
      expect(placeholderErrors).toHaveLength(1);
      expect(placeholderErrors[0].severity).toBe('error');
      expect(placeholderErrors[0].message).toMatch(/file:\/\//);
    });
  });

  describe('fenced-code-balance', () => {
    it('reports an error for unclosed fenced code blocks', () => {
      const diags = lintPrTemplate(UNCLOSED_FENCE_TEMPLATE, { repoRoot });
      const fenceErrors = diags.filter((d) => d.rule === 'fenced-code-balance');
      expect(fenceErrors).toHaveLength(1);
      expect(fenceErrors[0].severity).toBe('error');
    });
  });

  describe('checklist-format', () => {
    it('warns on malformed checklist items', () => {
      const diags = lintPrTemplate(MALFORMED_CHECKLIST_TEMPLATE, { repoRoot });
      const checklistWarnings = diags.filter((d) => d.rule === 'checklist-format');
      expect(checklistWarnings.length).toBeGreaterThanOrEqual(2);
      expect(checklistWarnings[0].severity).toBe('warning');
    });
  });
});

describe('extractMarkdownLinks', () => {
  it('correctly extracts inline markdown links with line numbers', () => {
    const lines = [
      'Line 1 without link',
      'Line 2 with [Guide](CONTRIBUTING.md) link',
      'Line 3 with [Code of Conduct](CODE_OF_CONDUCT.md)',
    ];
    const links = extractMarkdownLinks(lines);
    expect(links).toEqual([
      { text: 'Guide', url: 'CONTRIBUTING.md', line: 2 },
      { text: 'Code of Conduct', url: 'CODE_OF_CONDUCT.md', line: 3 },
    ]);
  });
});

describe('real .github/pull_request_template.md integration', () => {
  const prTemplatePath = path.resolve(repoRoot, '.github', 'pull_request_template.md');

  it('PR template file exists in .github/', () => {
    expect(fs.existsSync(prTemplatePath)).toBe(true);
  });

  it('produces zero errors on .github/pull_request_template.md', () => {
    const content = fs.readFileSync(prTemplatePath, 'utf8');
    const diags = lintPrTemplate(content, { repoRoot });
    const errors = diags.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});

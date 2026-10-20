#!/usr/bin/env node
// scripts/lint-pr-template.js
//
// PR template link & structural linter for Traqora.
//
// Contract
// ────────
// Input  : path to PR template (default: .github/pull_request_template.md)
// Output : JSON array of { rule, line, message, severity } on stdout
// Exit   : 0 when no errors (warnings are OK), 1 when ≥1 error
//
// Rules checked:
//   required-sections    – mandatory H2 headings must be present
//   valid-repo-links     – relative Markdown links must point to existing repo files
//   no-placeholder-links – links must not contain placeholder paths or absolute machine paths
//   fenced-code-balance  – every ``` open must have a matching close
//   checklist-format     – task lists must use valid - [ ] or - [x] formatting
//   no-trailing-whitespace – lines should not have trailing whitespace
//   max-line-length      – lines inside prose should be ≤ 200 chars

'use strict';

const fs = require('fs');
const path = require('path');

// ── Configuration ───────────────────────────────────────────────────────────

/** Headings that MUST appear in the PR template (case-insensitive substring match). */
const REQUIRED_SECTIONS = [
  'Summary',
  'Type of Change',
  'Related Issues',
  'Checklist',
  'Testing',
];

const MAX_LINE_LENGTH = 200;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{ rule: string; line: number; message: string; severity: 'error' | 'warning' }} LintDiagnostic
 */

/**
 * Parse all Markdown inline links `[text](url)` from lines.
 * Returns an array of { text, url, line }.
 */
function extractMarkdownLinks(lines) {
  const links = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (let i = 0; i < lines.length; i++) {
    let m;
    while ((m = linkRe.exec(lines[i])) !== null) {
      links.push({ text: m[1], url: m[2].trim(), line: i + 1 });
    }
  }
  return links;
}

// ── Core linter ─────────────────────────────────────────────────────────────

/**
 * Lint the PR template content.
 *
 * @param {string} content  – raw file content
 * @param {Object} [opts]
 * @param {string} [opts.repoRoot] – root path of the repository for link resolution
 * @returns {LintDiagnostic[]}
 */
function lintPrTemplate(content, opts = {}) {
  const repoRoot = opts.repoRoot || path.resolve(__dirname, '..');
  const lines = content.split(/\r?\n/);
  /** @type {LintDiagnostic[]} */
  const diagnostics = [];

  // ── 1. Required sections ────────────────────────────────────────────────
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const hm = lines[i].match(/^#{1,6}\s+(.+)/);
    if (hm) headings.push({ text: hm[1].trim(), line: i + 1 });
  }

  for (const section of REQUIRED_SECTIONS) {
    const found = headings.some((h) =>
      h.text.toLowerCase().includes(section.toLowerCase()),
    );
    if (!found) {
      diagnostics.push({
        rule: 'required-sections',
        line: 0,
        message: `Missing required PR template section: "${section}"`,
        severity: 'error',
      });
    }
  }

  // ── 2. Link validation (placeholders & repository file existence) ──────
  const links = extractMarkdownLinks(lines);
  for (const link of links) {
    const url = link.url;

    // Check placeholder / suspicious URLs
    if (/file:\/\//i.test(url) || /PLACEHOLDER|TODO|example\.com/i.test(url) || /^#TODO/i.test(url)) {
      diagnostics.push({
        rule: 'no-placeholder-links',
        line: link.line,
        message: `Suspicious or placeholder link target: "${url}"`,
        severity: 'error',
      });
      continue;
    }

    // Validate relative repository links (ignore external http/https/mailto)
    if (!/^(https?:\/\/|mailto:|#)/i.test(url)) {
      // Strip query/fragment if present
      const cleanPath = url.split('#')[0].split('?')[0];
      if (cleanPath.length > 0) {
        const targetAbs = path.resolve(repoRoot, cleanPath);
        if (!fs.existsSync(targetAbs)) {
          diagnostics.push({
            rule: 'valid-repo-links',
            line: link.line,
            message: `Link target "${url}" does not exist in repository (resolved to "${cleanPath}")`,
            severity: 'error',
          });
        }
      }
    }
  }

  // ── 3. Fenced code blocks ──────────────────────────────────────────────
  let insideFence = false;
  let fenceOpenLine = 0;
  const FENCE_RE = /^(\s*)(```+)/;

  for (let i = 0; i < lines.length; i++) {
    const fm = lines[i].match(FENCE_RE);
    if (fm) {
      if (!insideFence) {
        insideFence = true;
        fenceOpenLine = i + 1;
      } else {
        insideFence = false;
      }
    }
  }

  if (insideFence) {
    diagnostics.push({
      rule: 'fenced-code-balance',
      line: fenceOpenLine,
      message: `Unclosed fenced code block opened at line ${fenceOpenLine}`,
      severity: 'error',
    });
  }

  // ── 4. Checklist formatting check ──────────────────────────────────────
  const badChecklistRe = /^(\s*)-\s*\[([^ xX])\]/;
  for (let i = 0; i < lines.length; i++) {
    const cm = lines[i].match(badChecklistRe);
    if (cm) {
      diagnostics.push({
        rule: 'checklist-format',
        line: i + 1,
        message: `Malformed checklist item "${cm[0]}". Must be "- [ ]" or "- [x]"`,
        severity: 'warning',
      });
    }
  }

  // ── 5. Trailing whitespace ─────────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    if (/[ \t]+$/.test(lines[i])) {
      diagnostics.push({
        rule: 'no-trailing-whitespace',
        line: i + 1,
        message: 'Line has trailing whitespace',
        severity: 'warning',
      });
    }
  }

  // ── 6. Max line length (prose only — skip comments & code blocks) ─────
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inCode = !inCode;
      continue;
    }
    // Skip HTML comment lines in template
    if (!inCode && !lines[i].trim().startsWith('<!--') && lines[i].length > MAX_LINE_LENGTH) {
      diagnostics.push({
        rule: 'max-line-length',
        line: i + 1,
        message: `Line exceeds ${MAX_LINE_LENGTH} characters (${lines[i].length})`,
        severity: 'warning',
      });
    }
  }

  return diagnostics;
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const defaultTarget = path.join(repoRoot, '.github', 'pull_request_template.md');
  const fallbackTarget = path.join(repoRoot, '.github', 'PULL_REQUEST_TEMPLATE.md');

  let target = process.argv[2];
  if (!target || target.startsWith('--')) {
    if (fs.existsSync(defaultTarget)) {
      target = defaultTarget;
    } else if (fs.existsSync(fallbackTarget)) {
      target = fallbackTarget;
    } else {
      console.error(`Error: PR template not found at ${defaultTarget}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(target)) {
    console.error(`Error: ${target} not found`);
    process.exit(1);
  }

  const content = fs.readFileSync(target, 'utf8');
  const diagnostics = lintPrTemplate(content, { repoRoot });

  if (diagnostics.length === 0) {
    console.log(`✓ ${path.relative(repoRoot, target)} lint passed — all PR template links and structure are valid.`);
    process.exit(0);
  }

  // Print diagnostics
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  for (const d of diagnostics) {
    const prefix = d.severity === 'error' ? '✗' : '⚠';
    const loc = d.line > 0 ? `:${d.line}` : '';
    console.log(`  ${prefix} [${d.rule}]${loc}: ${d.message}`);
  }

  console.log(
    `\n${errors.length} error(s), ${warnings.length} warning(s)`,
  );

  // Also emit JSON on stdout when --json is passed
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(diagnostics, null, 2));
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

// ── Exports (for testing) ───────────────────────────────────────────────────
module.exports = {
  lintPrTemplate,
  extractMarkdownLinks,
  REQUIRED_SECTIONS,
  MAX_LINE_LENGTH,
};

// Run CLI when executed directly
if (require.main === module) {
  main();
}

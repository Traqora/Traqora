#!/usr/bin/env node
// scripts/lint-contributing.js
//
// CONTRIBUTING.md structural linter for Traqora.
//
// Contract
// ────────
// Input  : path to CONTRIBUTING.md (default: repo-root CONTRIBUTING.md)
// Output : JSON array of { rule, line, message, severity } on stdout
// Exit   : 0 when no errors (warnings are OK), 1 when ≥1 error
//
// Rules checked:
//   required-sections  – mandatory H2/H3 headings must be present
//   fenced-code-balance – every ``` open must have a matching close
//   fenced-code-lang    – fenced code blocks should specify a language
//   no-broken-links     – inline file:// links must not contain obvious placeholders
//   command-reference   – `npm run <x>` / `soroban test` mentioned in the doc
//                         must correspond to real scripts or known external tools
//   no-trailing-whitespace – lines should not have trailing whitespace
//   max-line-length     – lines inside prose (not code blocks) should be ≤ 200 chars

'use strict';

const fs = require('fs');
const path = require('path');

// ── Configuration ───────────────────────────────────────────────────────────

/** Headings that MUST appear (case-insensitive substring match). */
const REQUIRED_SECTIONS = [
  'Ways to Contribute',
  'Pull Request',
  'Code Guidelines',
  'Testing',
];

/** Known external commands that are NOT npm scripts (no validation needed). */
const KNOWN_EXTERNAL_COMMANDS = new Set([
  'soroban test',
  'cargo fmt',
  'cargo clippy',
  'cargo test',
  'cargo build',
  'cargo install',
  'cargo llvm-cov',
  'cargo audit',
  'git checkout',
  'git push',
]);

const MAX_LINE_LENGTH = 200;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{ rule: string; line: number; message: string; severity: 'error' | 'warning' }} LintDiagnostic
 */

/**
 * Parse all `npm run <script>` references out of a markdown string.
 * Returns an array of { script, line }.
 */
function extractNpmRunReferences(lines) {
  const refs = [];
  const re = /npm\s+run\s+([\w:./-]+)/g;
  for (let i = 0; i < lines.length; i++) {
    let m;
    while ((m = re.exec(lines[i])) !== null) {
      refs.push({ script: m[1], line: i + 1 });
    }
  }
  return refs;
}

/**
 * Collect available scripts from a package.json (and optionally workspace
 * package.json files).
 */
function collectNpmScripts(repoRoot) {
  const scripts = new Set();

  // Root package.json
  const rootPkg = path.join(repoRoot, 'package.json');
  if (fs.existsSync(rootPkg)) {
    const pkg = JSON.parse(fs.readFileSync(rootPkg, 'utf8'));
    if (pkg.scripts) Object.keys(pkg.scripts).forEach((s) => scripts.add(s));
  }

  // Workspace packages
  const pkgDir = path.join(repoRoot, 'packages');
  if (fs.existsSync(pkgDir)) {
    for (const name of fs.readdirSync(pkgDir)) {
      const wsPkg = path.join(pkgDir, name, 'package.json');
      if (fs.existsSync(wsPkg)) {
        const pkg = JSON.parse(fs.readFileSync(wsPkg, 'utf8'));
        if (pkg.scripts) Object.keys(pkg.scripts).forEach((s) => scripts.add(s));
      }
    }
  }

  return scripts;
}

// ── Core linter ─────────────────────────────────────────────────────────────

/**
 * Lint the CONTRIBUTING.md content.
 *
 * @param {string}   content  – raw file content
 * @param {Object}   [opts]
 * @param {Set<string>} [opts.availableScripts] – npm scripts to validate against
 * @returns {LintDiagnostic[]}
 */
function lintContributing(content, opts = {}) {
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
    const found = headings.some(
      (h) => h.text.toLowerCase().includes(section.toLowerCase()),
    );
    if (!found) {
      diagnostics.push({
        rule: 'required-sections',
        line: 0,
        message: `Missing required section: "${section}"`,
        severity: 'error',
      });
    }
  }

  // ── 2. Fenced code blocks ──────────────────────────────────────────────
  let insideFence = false;
  let fenceOpenLine = 0;
  const FENCE_RE = /^(\s*)(```+)/;

  for (let i = 0; i < lines.length; i++) {
    const fm = lines[i].match(FENCE_RE);
    if (fm) {
      if (!insideFence) {
        insideFence = true;
        fenceOpenLine = i + 1;

        // Check language tag
        const afterBackticks = lines[i].slice(fm[0].length).trim();
        if (!afterBackticks) {
          diagnostics.push({
            rule: 'fenced-code-lang',
            line: i + 1,
            message: 'Fenced code block should specify a language (e.g. ```bash)',
            severity: 'warning',
          });
        }
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

  // ── 3. Broken file:// links ────────────────────────────────────────────
  const linkRe = /\[([^\]]*)\]\((file:\/\/[^)]*)\)/g;
  for (let i = 0; i < lines.length; i++) {
    let lm;
    while ((lm = linkRe.exec(lines[i])) !== null) {
      const url = lm[2];
      if (/\/Users\/ew\/|PLACEHOLDER|TODO|example\.com/i.test(url)) {
        diagnostics.push({
          rule: 'no-broken-links',
          line: i + 1,
          message: `Suspicious file link (may be a placeholder): ${url}`,
          severity: 'error',
        });
      }
    }
  }

  // ── 4. npm run command references ──────────────────────────────────────
  if (opts.availableScripts && opts.availableScripts.size > 0) {
    const refs = extractNpmRunReferences(lines);
    for (const ref of refs) {
      if (!opts.availableScripts.has(ref.script)) {
        diagnostics.push({
          rule: 'command-reference',
          line: ref.line,
          message: `"npm run ${ref.script}" referenced but "${ref.script}" is not in any package.json scripts`,
          severity: 'error',
        });
      }
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

  // ── 6. Max line length (prose only — skip code blocks) ─────────────────
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inCode = !inCode;
      continue;
    }
    if (!inCode && lines[i].length > MAX_LINE_LENGTH) {
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
  const target = process.argv[2] || path.join(repoRoot, 'CONTRIBUTING.md');

  if (!fs.existsSync(target)) {
    console.error(`Error: ${target} not found`);
    process.exit(1);
  }

  const content = fs.readFileSync(target, 'utf8');
  const availableScripts = collectNpmScripts(repoRoot);
  const diagnostics = lintContributing(content, { availableScripts });

  if (diagnostics.length === 0) {
    console.log('✓ CONTRIBUTING.md lint passed — no issues found.');
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
  lintContributing,
  extractNpmRunReferences,
  collectNpmScripts,
  REQUIRED_SECTIONS,
  KNOWN_EXTERNAL_COMMANDS,
  MAX_LINE_LENGTH,
};

// Run CLI when executed directly
if (require.main === module) {
  main();
}

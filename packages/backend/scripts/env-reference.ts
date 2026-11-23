/**
 * Generate or verify docs/ENV_REFERENCE.md from the annotated env.example files (issue #762).
 *
 *   npm run docs:env            write docs/ENV_REFERENCE.md
 *   npm run verify:env-docs     fail if the doc is stale or env.example has format errors
 *   ... --strict                also fail when src/config/index.ts reads an undocumented variable
 *
 * Exit codes: 0 ok, 1 check failed.
 */
import fs from 'fs';
import path from 'path';
import {
  extractProcessEnvNames,
  findUndocumented,
  parseEnvExample,
  renderEnvReference,
  type EnvReferenceSource,
} from '../src/config/envReference';

const repoRoot = path.resolve(__dirname, '../../..');
const SOURCES = ['env.example', 'packages/backend/env.example'];
const OUTPUT = 'docs/ENV_REFERENCE.md';
const CONFIG_FILE = 'packages/backend/src/config/index.ts';

const args = new Set(process.argv.slice(2));
const check = args.has('--check');
const strict = args.has('--strict');

let failed = false;
const sources: EnvReferenceSource[] = [];

for (const relative of SOURCES) {
  const { entries, issues } = parseEnvExample(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
  for (const issue of issues) {
    console.error(`❌ ${relative}:${issue.line} [${issue.code}] ${issue.message}`);
    failed = true;
  }
  sources.push({ path: relative, entries });
}

const backendEntries = sources.find((s) => s.path === 'packages/backend/env.example')?.entries ?? [];
const used = extractProcessEnvNames(fs.readFileSync(path.join(repoRoot, CONFIG_FILE), 'utf8'));
const undocumented = findUndocumented(used, backendEntries);
if (undocumented.length > 0) {
  const log = strict ? console.error : console.warn;
  log(
    `${strict ? '❌' : '⚠️ '} ${undocumented.length} variable(s) read in ${CONFIG_FILE} are not documented in packages/backend/env.example:\n  ${undocumented.join(', ')}`,
  );
  if (strict) failed = true;
}

const rendered = renderEnvReference(sources);
const outputPath = path.join(repoRoot, OUTPUT);

if (check) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== rendered) {
    console.error(`❌ ${OUTPUT} is out of date. Run: cd packages/backend && npm run docs:env`);
    failed = true;
  }
} else if (!failed) {
  fs.writeFileSync(outputPath, rendered);
  console.log(`✅ Wrote ${OUTPUT} (${sources.map((s) => `${s.path}: ${s.entries.length}`).join(', ')})`);
}

if (failed) process.exit(1);
if (check) console.log(`✅ ${OUTPUT} is up to date`);

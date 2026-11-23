import fs from 'fs';
import path from 'path';
import {
  extractProcessEnvNames,
  findUndocumented,
  parseEnvExample,
  renderEnvReference,
} from '../../src/config/envReference';

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

const SAMPLE = `# ==============================================================================
# TRAQORA EXAMPLE
# ==============================================================================
# Copy this file to .env
# ==============================================================================

# ==============================================================================
# 1. SERVER CONFIGURATION
# ==============================================================================

# The port the backend server will listen on.
# Type: [Number] | Default: 3001
PORT=3001

# The application environment.
# Type: [Enum: development | production] | Default: development
NODE_ENV=development

# ------------------------------------------------------------------------------
# OPTIONAL
# ------------------------------------------------------------------------------

# Database URL.
# Type: [String] | Default: sqlite::memory:
# Example (Postgres): postgres://localhost/traqora
DATABASE_URL=sqlite::memory:

# Sentry org/project.
# Type: [String] | Default: (None)
# SENTRY_ORG=
# SENTRY_PROJECT=
`;

describe('parseEnvExample', () => {
  it('parses description, type, default, example and section for each variable', () => {
    const { entries, issues } = parseEnvExample(SAMPLE);

    expect(issues).toEqual([]);
    expect(entries.map((e) => e.name)).toEqual(['PORT', 'NODE_ENV', 'DATABASE_URL', 'SENTRY_ORG', 'SENTRY_PROJECT']);
    expect(entries[0]).toMatchObject({
      name: 'PORT',
      section: '1. SERVER CONFIGURATION',
      description: 'The port the backend server will listen on.',
      type: 'Number',
      defaultValue: '3001',
      exampleValue: '3001',
      commented: false,
    });
    expect(entries[1].type).toBe('Enum: development | production');
    expect(entries[2]).toMatchObject({
      section: 'OPTIONAL',
      example: 'Example (Postgres): postgres://localhost/traqora',
    });
  });

  it('shares one comment block between several commented-out variables', () => {
    const { entries } = parseEnvExample(SAMPLE);
    const [org, project] = entries.slice(3);
    expect(org).toMatchObject({ commented: true, description: 'Sentry org/project.', defaultValue: '(None)' });
    expect(project).toMatchObject({ commented: true, description: 'Sentry org/project.', type: 'String' });
  });

  it('does not treat "Example: VAR=value" comment lines as variables', () => {
    const { entries } = parseEnvExample('# Nodes.\n# Type: [String] | Default: (None)\n# Example: NODES=a,b\nNODES=\n');
    expect(entries.map((e) => e.name)).toEqual(['NODES']);
  });

  it('reports a variable without a Type line', () => {
    const { issues } = parseEnvExample('# Comma-separated arbitrators.\nDISPUTE_ARBITRATORS=a,b\n');
    expect(issues).toEqual([
      expect.objectContaining({ code: 'MISSING_TYPE', name: 'DISPUTE_ARBITRATORS', line: 2 }),
    ]);
  });

  it('reports a variable without a description', () => {
    const { issues } = parseEnvExample('# Type: [Number] | Default: 1\nWORKERS=1\n');
    expect(issues.map((i) => i.code)).toEqual(['MISSING_DESCRIPTION']);
  });

  it('reports duplicate variables and keeps the first definition', () => {
    const { entries, issues } = parseEnvExample(
      '# Port.\n# Type: [Number] | Default: 1\nPORT=1\n\n# Port again.\n# Type: [Number] | Default: 2\nPORT=2\n',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].defaultValue).toBe('1');
    expect(issues).toEqual([
      expect.objectContaining({ code: 'DUPLICATE_VARIABLE', name: 'PORT', line: 7 }),
    ]);
  });

  it('does not carry metadata across a blank line', () => {
    const { issues } = parseEnvExample('# Port.\n# Type: [Number] | Default: 1\n\nPORT=1\n');
    expect(issues.map((i) => i.code).sort()).toEqual(['MISSING_DESCRIPTION', 'MISSING_TYPE']);
  });
});

describe('renderEnvReference', () => {
  it('renders one table per section and escapes pipes', () => {
    const { entries } = parseEnvExample(SAMPLE);
    const md = renderEnvReference([{ path: 'env.example', entries }]);

    expect(md).toContain('## `env.example`');
    expect(md).toContain('### 1. SERVER CONFIGURATION');
    expect(md).toContain('| `PORT` | Number | 3001 | The port the backend server will listen on. |');
    expect(md).toContain('| `NODE_ENV` | Enum: development \\| production | development |');
    expect(md).toContain('| `SENTRY_ORG` *(commented out)* | String | (None) | Sentry org/project. |');
    expect(md.endsWith('\n')).toBe(true);
  });
});

describe('extractProcessEnvNames / findUndocumented', () => {
  it('finds dot and bracket access and reports undocumented names', () => {
    const names = extractProcessEnvNames("const a = process.env.PORT; const b = process.env['SECRET_KEY']; process.env.PORT;");
    expect(names).toEqual(['PORT', 'SECRET_KEY']);

    const { entries } = parseEnvExample(SAMPLE);
    expect(findUndocumented(names, entries)).toEqual(['SECRET_KEY']);
  });
});

describe('repository env.example files', () => {
  const files = ['env.example', 'packages/backend/env.example'];

  it.each(files)('%s follows the documented format', (file) => {
    const { entries, issues } = parseEnvExample(read(file));
    expect(issues).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('docs/ENV_REFERENCE.md is up to date (run `npm run docs:env`)', () => {
    const sources = files.map((file) => ({ path: file, entries: parseEnvExample(read(file)).entries }));
    expect(read('docs/ENV_REFERENCE.md')).toBe(renderEnvReference(sources));
  });
});

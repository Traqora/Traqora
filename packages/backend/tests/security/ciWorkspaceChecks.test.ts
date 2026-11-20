/**
 * Backend and client CI check contract (issue #1194).
 *
 * Both CI workflows already run lint, typecheck, unit tests and builds for the
 * backend and client workspaces. These assertions keep that coverage from
 * silently regressing: dropping a job, removing a workspace flag, or pointing
 * a test step at the wrong workspace fails here with a clear message instead
 * of reducing V1 CI coverage unnoticed.
 *
 * The client typecheck in `ci-pipeline.yml` was restored by this change set;
 * this test is the regression guard for it.
 */
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const WORKFLOWS = [
  '.github/workflows/ci.yml',
  '.github/workflows/ci-pipeline.yml',
] as const;

const readWorkflow = (relativePath: string): string =>
  fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');

type Workspace = 'backend' | 'client';
type Check = 'typecheck' | 'lint' | 'test' | 'build';

const CHECK_PATTERNS: Record<Check, (workspace: Workspace) => RegExp> = {
  typecheck: (workspace) =>
    new RegExp(`npm run typecheck --workspace=packages/${workspace}\\b`),
  lint: (workspace) =>
    new RegExp(`npm run lint --workspace=packages/${workspace}\\b`),
  test: (workspace) =>
    workspace === 'backend'
      ? /npm (?:run test(?::coverage)?|test) --workspace=packages\/backend\b/
      : /npm (?:run test|test) --workspace=packages\/client\b/,
  build: (workspace) =>
    new RegExp(`npm run build --workspace=packages/${workspace}\\b`),
};

const WORKSPACES: Workspace[] = ['backend', 'client'];
const CHECKS: Check[] = ['typecheck', 'lint', 'test', 'build'];

describe('backend and client CI checks (issue #1194)', () => {
  for (const workflowPath of WORKFLOWS) {
    describe(workflowPath, () => {
      const workflow = readWorkflow(workflowPath);

      for (const workspace of WORKSPACES) {
        for (const check of CHECKS) {
          test(`${workflowPath} runs ${check} for packages/${workspace}`, () => {
            expect(workflow).toMatch(CHECK_PATTERNS[check](workspace));
          });
        }
      }
    });
  }

  test('typecheck, test and build failures are never suppressed', () => {
    for (const workflowPath of WORKFLOWS) {
      const workflow = readWorkflow(workflowPath);
      // `|| true` is acceptable on advisory lint or log-summary steps while
      // pre-existing findings are cleaned up, but never on a blocking check.
      const suppressed = workflow
        .split('\n')
        .filter((line) => line.includes('|| true'));
      expect(suppressed.length).toBeGreaterThan(0);
      for (const line of suppressed) {
        expect(line).not.toMatch(/npm run typecheck --workspace=packages\/(backend|client)/);
        expect(line).not.toMatch(/npm (?:run )?test(?:[: ][^ ]*)? --workspace=packages\/(backend|client)/);
        expect(line).not.toMatch(/npm run build --workspace=packages\/(backend|client)/);
      }
    }
  });
});

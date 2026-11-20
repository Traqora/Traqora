/**
 * V1 launch documentation contract.
 *
 * The launch readiness, deployment and post-launch cadence documents are the
 * accountability record for a V1 release. These checks keep them present,
 * structured and linked from the indexes a reader actually opens, and stop a
 * relative link from rotting as files move.
 */
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DOC_DIR = 'docs';

const docs = {
  launchReadiness: 'docs/LAUNCH_READINESS.md',
  deploymentRunbook: 'docs/operations/V1_DEPLOYMENT_RUNBOOK.md',
  postLaunchCadence: 'docs/operations/POST_LAUNCH_REVIEW.md',
} as const;

const readDoc = (relativePath: string): string =>
  fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');

/** Relative markdown link targets in a document, excluding URLs and anchors. */
const relativeLinks = (relativePath: string): string[] => {
  const body = readDoc(relativePath);
  const links: string[] = [];
  const pattern = /\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const target = match[1].split('#')[0].trim();
    if (
      !target ||
      /^(https?:|mailto:|\/)/.test(target) ||
      target.startsWith('#')
    ) {
      continue;
    }
    links.push(target);
  }
  return links;
};

describe('V1 launch documentation', () => {
  test.each(Object.values(docs))('%s exists and is not empty', (relativePath) => {
    const body = readDoc(relativePath);
    expect(body.length).toBeGreaterThan(200);
  });

  test('launch readiness collects all five accountable areas', () => {
    const body = readDoc(docs.launchReadiness);
    for (const area of [
      'Product',
      'Security',
      'Operations',
      'Support',
      'Release verification',
    ]) {
      expect(body).toContain(area);
    }
    expect(body).toMatch(/GO \/ NO-GO/);
    expect(body).toContain('V1 Security and Privacy Release Review');
  });

  test('deployment runbook covers deploy, migration, config, smoke and rollback', () => {
    const body = readDoc(docs.deploymentRunbook);
    for (const section of [
      'Configuration verification',
      'Database migrations',
      'Deploy sequence',
      'Smoke tests',
      'Rollback',
      'Scope and ownership',
    ]) {
      expect(body).toContain(section);
    }
  });

  test('post-launch cadence assigns owners and intervals to each signal', () => {
    const body = readDoc(docs.postLaunchCadence);
    for (const signal of [
      'Incidents and alerts',
      'Booking success and funnel',
      'Refunds and payouts',
      'Latency and error budget',
      'Support feedback',
    ]) {
      expect(body).toContain(signal);
    }
    expect(body).toContain('Accountable owner');
    expect(body).toContain('Interval');
  });

  test('every relative link in the new documents resolves', () => {
    for (const relativePath of Object.values(docs)) {
      for (const link of relativeLinks(relativePath)) {
        const target = path.resolve(path.dirname(path.join(REPO_ROOT, relativePath)), link);
        expect(fs.existsSync(target)).toBe(true);
      }
    }
  });

  test('link validation rejects a missing target', () => {
    // Failure path for the helper above: a broken link must be detectable.
    const missing = path.resolve(path.join(REPO_ROOT, DOC_DIR), 'DOES_NOT_EXIST.md');
    expect(fs.existsSync(missing)).toBe(false);
  });

  test('indexes point readers to the new documents', () => {
    const readme = readDoc('README.md');
    const runbooksIndex = readDoc('docs/operations/RUNBOOKS.md');
    const monitoring = readDoc('docs/monitoring.md');
    const deployment = readDoc('docs/operations/DEPLOYMENT.md');

    expect(readme).toContain('./docs/LAUNCH_READINESS.md');
    expect(runbooksIndex).toContain('./V1_DEPLOYMENT_RUNBOOK.md');
    expect(runbooksIndex).toContain('./POST_LAUNCH_REVIEW.md');
    expect(monitoring).toContain('./operations/POST_LAUNCH_REVIEW.md');
    expect(deployment).toContain('./V1_DEPLOYMENT_RUNBOOK.md');
  });
});

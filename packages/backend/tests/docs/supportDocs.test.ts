import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');
const operationsDir = path.join(repoRoot, 'docs', 'operations');
const read = (name: string) => fs.readFileSync(path.join(operationsDir, name), 'utf8');

function headings(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^#{1,6}\s/, '').trim());
}

function relativeLinks(markdown: string, fromDir: string): string[] {
  const links: string[] = [];
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(https?:|mailto:|\/)/.test(target)) continue;
    links.push(path.resolve(fromDir, decodeURIComponent(target)));
  }
  return links;
}

describe('traveler support and operations documentation', () => {
  const escalation = read('TRAVELER_SUPPORT_ESCALATION.md');
  const operations = read('BOOKING_OPERATIONS_VIEW.md');
  const readme = read('README.md');

  it('documents handling for all five v1 incident types', () => {
    const present = headings(escalation);
    for (const heading of [
      'Payment incidents',
      'Supplier incidents',
      'Booking incidents',
      'Cancellation incidents',
      'Refund incidents',
    ]) {
      expect(present).toContain(heading);
    }
  });

  it('states the audit fields and all four support audit actions', () => {
    for (const term of [
      'actor',
      'reason',
      'booking reference',
      'timestamp',
      'support_booking_access',
      'support_booking_change',
      'support_access_denied',
      'support_change_failed',
    ]) {
      expect(escalation.toLowerCase()).toContain(term.toLowerCase());
    }
  });

  it('documents the operations fields and explicit unavailable states', () => {
    for (const term of [
      'bookingState',
      'supplierState',
      'paymentReference',
      'contractState',
      'reconciliationStatus',
      'mismatches',
      'summary',
      'unavailable',
      'not_attempted',
      'needs_review',
    ]) {
      expect(operations).toContain(term);
    }
  });

  it('links both new guides from the operations README', () => {
    expect(readme).toContain('[Booking Operations View](BOOKING_OPERATIONS_VIEW.md)');
    expect(readme).toContain('[Traveler Support Escalation](TRAVELER_SUPPORT_ESCALATION.md)');
  });

  it('keeps every relative markdown link resolvable', () => {
    for (const [name, markdown] of [
      ['TRAVELER_SUPPORT_ESCALATION.md', escalation],
      ['BOOKING_OPERATIONS_VIEW.md', operations],
      ['README.md', readme],
    ] as const) {
      for (const target of relativeLinks(markdown, operationsDir)) {
        expect(fs.existsSync(target)).toBe(true);
      }
    }
  });
});

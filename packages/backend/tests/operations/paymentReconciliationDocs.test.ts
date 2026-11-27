import fs from 'fs';
import path from 'path';

describe('Payment Reconciliation Procedures Documentation', () => {
  const docPath = path.resolve(__dirname, '../../../../docs/operations/payment-reconciliation.md');
  const readmePath = path.resolve(__dirname, '../../../../docs/operations/README.md');

  it('verifies payment-reconciliation.md exists and is readable', () => {
    expect(fs.existsSync(docPath)).toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content.length).toBeGreaterThan(200);
  });

  it('covers the four core reconciliation domains: wallet, backend, supplier, and booking', () => {
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/Wallet/i);
    expect(content).toMatch(/Backend/i);
    expect(content).toMatch(/Supplier/i);
    expect(content).toMatch(/Booking/i);
  });

  it('documents operator authorization requirements (booking:reconcile)', () => {
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('booking:reconcile');
  });

  it('documents valid recovery actions supported by bookingRecoveryService', () => {
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('retry_confirmation');
    expect(content).toContain('mark_failed');
    expect(content).toContain('Idempotency-Key');
  });

  it('preserves privacy requirements prohibiting passenger PII leakage', () => {
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/PII|Personally Identifiable Information/i);
    expect(content).toMatch(/private keys/i);
  });

  it('is referenced in docs/operations/README.md', () => {
    const readmeContent = fs.readFileSync(readmePath, 'utf-8');
    expect(readmeContent).toContain('payment-reconciliation.md');
  });
});

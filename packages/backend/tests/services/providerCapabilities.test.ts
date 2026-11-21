import { getProviderCapabilities } from '../../src/services/providerCapabilities';

describe('provider capability matrix', () => {
  it('keeps sandbox booking and ancillary fulfilment explicitly partial', () => {
    const capabilities = getProviderCapabilities('sandbox');
    expect(capabilities.booking.status).toBe('partial');
    expect(capabilities.ancillary.status).toBe('partial');
    expect(capabilities.booking.failureNotes.join(' ')).toMatch(/does not prove production/i);
  });

  it('documents live search data and failover behavior separately from sandbox fixtures', () => {
    const capabilities = getProviderCapabilities('production');
    expect(capabilities.search.dataNotes.join(' ')).toMatch(/time-sensitive/i);
    expect(capabilities.search.failureNotes.join(' ')).toMatch(/failover/i);
  });
});

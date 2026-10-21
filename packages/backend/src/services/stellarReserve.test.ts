import {
  assertSourceCanCoverReserve,
  estimateReserveImpact,
  InsufficientReserveError,
} from './stellarReserve';

const funded = {
  balances: [{ asset_type: 'native', balance: '10.0000000' }],
  subentry_count: 0,
};

describe('stellar account reserve before signing (#920)', () => {
  it('allows a signature when the balance stays above the minimum after the fee', () => {
    const impact = estimateReserveImpact(funded, { feeStroops: 100n });
    expect(impact?.sufficient).toBe(true);
    expect(impact?.minimumReserveStroops).toBe(10_000_000n);
    expect(assertSourceCanCoverReserve(funded, { feeStroops: 100n })?.sufficient).toBe(true);
  });

  it('refuses to sign when the fee would drop the account under the reserve', () => {
    const account = {
      balances: [{ asset_type: 'native', balance: '1.0000000' }],
      subentry_count: 0,
    };
    const impact = estimateReserveImpact(account, { feeStroops: 100n });
    expect(impact?.sufficient).toBe(false);
    expect(() => assertSourceCanCoverReserve(account, { feeStroops: 100n })).toThrow(
      InsufficientReserveError,
    );
  });

  it('counts extra subentries and sponsorship toward the minimum', () => {
    const account = {
      balances: [{ assetType: 'native', balance: '2.0000000' }],
      subentryCount: 0,
      numSponsoring: 2,
    };
    const impact = estimateReserveImpact(account, {
      feeStroops: 100n,
      additionalSubentries: 0,
    });
    expect(impact?.minimumReserveStroops).toBe(20_000_000n);
    expect(impact?.sufficient).toBe(false);
  });

  it('skips the check when the snapshot has no native balance', () => {
    expect(estimateReserveImpact({ sequence: '1' })).toBeNull();
    expect(assertSourceCanCoverReserve({ sequence: '1' }, { feeStroops: 100n })).toBeNull();
  });

  it('succeeds on retry after the account is funded', () => {
    const poor = { balances: [{ asset_type: 'native', balance: '0.5000000' }], subentry_count: 0 };
    expect(() => assertSourceCanCoverReserve(poor, { feeStroops: 100n })).toThrow(
      InsufficientReserveError,
    );
    const fundedRetry = {
      balances: [{ asset_type: 'native', balance: '5.0000000' }],
      subentry_count: 0,
    };
    expect(assertSourceCanCoverReserve(fundedRetry, { feeStroops: 100n })?.sufficient).toBe(true);
  });
});

import {
  assertCheckoutActionable,
  OfferExpiredError,
  resolveCheckoutExpiry,
} from './checkoutOfferExpiry';

const refreshPath = '/flights/offers/refresh';

describe('checkout expiry aligned to the flight offer (#918)', () => {
  it('keeps checkout open only until the earlier of the session and the offer', () => {
    const decision = resolveCheckoutExpiry({
      sessionExpiresAt: '2026-11-02T12:00:00.000Z',
      offerExpiresAt: '2026-11-02T09:00:00.000Z',
      now: '2026-11-02T08:00:00.000Z',
      refreshPath,
    });
    expect(decision.actionable).toBe(true);
    expect(decision.code).toBe('CHECKOUT_OPEN');
    expect(decision.actionableUntil).toBe('2026-11-02T09:00:00.000Z');
    expect(assertCheckoutActionable({
      sessionExpiresAt: '2026-11-02T12:00:00.000Z',
      offerExpiresAt: '2026-11-02T09:00:00.000Z',
      now: '2026-11-02T08:00:00.000Z',
      refreshPath,
    }).actionable).toBe(true);
  });

  it('rejects a session whose offer has already expired and returns the refresh path', () => {
    const decision = resolveCheckoutExpiry({
      sessionExpiresAt: '2026-11-02T12:00:00.000Z',
      offerExpiresAt: '2026-11-02T09:00:00.000Z',
      now: '2026-11-02T09:00:00.000Z',
      refreshPath,
    });
    expect(decision.actionable).toBe(false);
    expect(decision.code).toBe('OFFER_EXPIRED');
    expect(decision.refreshPath).toBe(refreshPath);
    expect(() =>
      assertCheckoutActionable({
        sessionExpiresAt: '2026-11-02T12:00:00.000Z',
        offerExpiresAt: '2026-11-02T09:00:00.000Z',
        now: '2026-11-02T10:00:00.000Z',
        refreshPath,
      }),
    ).toThrow(OfferExpiredError);
  });

  it('treats an unreadable offer expiry as expired', () => {
    const decision = resolveCheckoutExpiry({
      sessionExpiresAt: '2026-11-02T12:00:00.000Z',
      offerExpiresAt: 'not-a-date',
      now: '2026-11-02T08:00:00.000Z',
      refreshPath,
    });
    expect(decision.code).toBe('OFFER_EXPIRED');
    expect(decision.actionable).toBe(false);
  });

  it('accepts a retry once the caller refreshes the offer', () => {
    const expired = {
      sessionExpiresAt: '2026-11-02T12:00:00.000Z',
      offerExpiresAt: '2026-11-02T09:00:00.000Z',
      now: '2026-11-02T10:00:00.000Z',
      refreshPath,
    };
    expect(resolveCheckoutExpiry(expired).actionable).toBe(false);
    const refreshed = resolveCheckoutExpiry({
      ...expired,
      offerExpiresAt: '2026-11-02T11:30:00.000Z',
      sessionExpiresAt: '2026-11-02T11:30:00.000Z',
    });
    expect(refreshed.actionable).toBe(true);
    expect(refreshed.code).toBe('CHECKOUT_OPEN');
  });
});

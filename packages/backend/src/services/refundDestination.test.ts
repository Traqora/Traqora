import { StripeRefundLike, verifyRefundToOriginalDestination } from './refundDestination';

const EXPECTED = { paymentIntentId: 'pi_original123', amountCents: 10_000, currency: 'usd' };

function success(overrides: Partial<StripeRefundLike> = {}): StripeRefundLike {
  return {
    id: 're_mock123',
    status: 'succeeded',
    payment_intent: 'pi_original123',
    amount: 10_000,
    currency: 'usd',
    ...overrides,
  };
}

describe('verifyRefundToOriginalDestination (issue #1154)', () => {
  it('verifies a succeeded refund to the original payment intent', () => {
    expect(verifyRefundToOriginalDestination(success(), EXPECTED)).toMatchObject({
      verified: true,
      status: 'succeeded',
    });
  });

  it('accepts a pending refund but labels it as awaiting settlement', () => {
    const result = verifyRefundToOriginalDestination(success({ status: 'pending' }), EXPECTED);
    expect(result.verified).toBe(true);
    expect(result.reason).toContain('awaiting settlement');
  });

  it.each(['failed', 'canceled', 'requires_action'])('rejects a %s refund', (status) => {
    const result = verifyRefundToOriginalDestination(success({ status }), EXPECTED);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain(status);
  });

  it('rejects a refund against a different payment intent', () => {
    expect(verifyRefundToOriginalDestination(success({ payment_intent: 'pi_other' }), EXPECTED)).toMatchObject({
      verified: false,
      reason: expect.stringContaining('does not match the original payment'),
    });
  });

  it('rejects a refund with no payment intent or no identifier', () => {
    expect(verifyRefundToOriginalDestination(success({ payment_intent: null }), EXPECTED).verified).toBe(false);
    expect(verifyRefundToOriginalDestination(success({ id: '' }), EXPECTED).verified).toBe(false);
  });

  it('rejects a refund routed to an explicit destination override', () => {
    expect(verifyRefundToOriginalDestination(success({ destination: 'ba_other' }), EXPECTED)).toMatchObject({
      verified: false,
      reason: expect.stringContaining('destination override'),
    });
  });

  it('rejects a mismatched amount and currency', () => {
    expect(verifyRefundToOriginalDestination(success({ amount: 9_000 }), EXPECTED).verified).toBe(false);
    expect(verifyRefundToOriginalDestination(success({ currency: 'eur' }), EXPECTED).verified).toBe(false);
  });

  it('rejects an unknown status and surfaces a failure reason', () => {
    expect(verifyRefundToOriginalDestination(success({ status: 'mystery' }), EXPECTED).reason).toContain('Unrecognised');
    expect(
      verifyRefundToOriginalDestination(
        success({ status: 'failed', failure_reason: 'expired_or_canceled_card' }),
        EXPECTED
      ).reason
    ).toContain('expired_or_canceled_card');
  });

  it('does not require amount or currency when the rail omits them', () => {
    expect(verifyRefundToOriginalDestination({ id: 're_1', status: 'succeeded', payment_intent: 'pi_original123' }, EXPECTED).verified).toBe(true);
  });
});

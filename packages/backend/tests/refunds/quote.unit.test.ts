import {
  CANCELLATION_QUOTE_TTL_MS,
  QuoteUnavailableError,
  RefundService,
} from '../../src/services/refundService';

describe('getCancellationQuote (unit)', () => {
  const service = RefundService.getInstance();
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  it('returns an eligible quote with refund, currency, fees and a future expiry', async () => {
    const quote = await service.getCancellationQuote({
      id: 'booking-1',
      status: 'confirmed',
      amountCents: 35000,
      flight: { departureTime: future, status: 'SCHEDULED', airlineCode: 'TEST' },
    } as any);

    expect(quote.bookingId).toBe('booking-1');
    expect(quote.outcome).toBe('eligible');
    expect(quote.currency).toBe('USD');
    expect(quote.originalAmountCents).toBe(35000);
    expect(quote.estimatedRefundCents).toBeGreaterThan(0);
    expect(quote.estimatedRefundCents).toBeLessThanOrEqual(35000);
    expect(quote.fees.totalFeeCents).toBe(
      quote.fees.processingFeeCents + quote.fees.cancellationFeeCents
    );
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(
      new Date(quote.quotedAt).getTime()
    );
  });

  it('reports ineligible with zero refund for an unconfirmed booking', async () => {
    const quote = await service.getCancellationQuote({
      id: 'booking-2',
      status: 'created',
      amountCents: 35000,
      flight: { departureTime: future, status: 'SCHEDULED', airlineCode: 'TEST' },
    } as any);

    expect(quote.outcome).toBe('ineligible');
    expect(quote.estimatedRefundCents).toBe(0);
  });

  it('caps expiry at departure when the flight leaves inside the quote window', async () => {
    const soon = new Date(Date.now() + 60 * 1000);
    const quote = await service.getCancellationQuote({
      id: 'booking-3',
      status: 'confirmed',
      amountCents: 35000,
      flight: { departureTime: soon, status: 'SCHEDULED', airlineCode: 'TEST' },
    } as any);

    expect(new Date(quote.expiresAt).getTime()).toBeLessThanOrEqual(soon.getTime());
    expect(CANCELLATION_QUOTE_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('rejects missing flight, departure time and amount', async () => {
    await expect(service.getCancellationQuote({ id: 'x', amountCents: 1 } as any)).rejects.toMatchObject({
      code: 'MISSING_FLIGHT',
    });
    await expect(
      service.getCancellationQuote({
        id: 'x',
        amountCents: 1,
        flight: { departureTime: undefined },
      } as any)
    ).rejects.toMatchObject({ code: 'MISSING_DEPARTURE_TIME' });
    await expect(
      service.getCancellationQuote({
        id: 'x',
        amountCents: Number.NaN,
        flight: { departureTime: future },
      } as any)
    ).rejects.toMatchObject({ code: 'MISSING_AMOUNT' });
    expect(new QuoteUnavailableError('MISSING_FLIGHT', 'x').name).toBe('QuoteUnavailableError');
  });
});

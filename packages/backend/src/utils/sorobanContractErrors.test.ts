import { BOOKING_CONTRACT_ERRORS, mapBookingContractError } from './sorobanContractErrors';

describe('mapBookingContractError', () => {
  it('maps a recognized panic message embedded in a raw simulation error string', () => {
    const result = mapBookingContractError(
      'HostError: Error(WasmVm, InvalidAction)\n\nEvent log ...\n"Booking not found"',
    );
    expect(result).toEqual({
      code: 'BOOKING_NOT_FOUND',
      message: 'This booking does not exist on-chain.',
      statusCode: 404,
    });
  });

  it('matches even when wrapped in the "Simulation failed: " prefix soroban.ts throws with', () => {
    const result = mapBookingContractError('Simulation failed: HostError: ... "No funds in escrow" ...');
    expect(result?.code).toBe('BOOKING_NO_FUNDS_IN_ESCROW');
    expect(result?.statusCode).toBe(409);
  });

  it.each(Object.entries(BOOKING_CONTRACT_ERRORS))(
    'maps every known panic message to its own distinct mapping (%s)',
    (panicMessage, expected) => {
      expect(mapBookingContractError(panicMessage)).toEqual(expected);
    },
  );

  it('returns undefined for a message that matches no known panic string', () => {
    expect(mapBookingContractError('some unrelated network timeout')).toBeUndefined();
  });

  it('returns undefined for undefined, null, or empty input', () => {
    expect(mapBookingContractError(undefined)).toBeUndefined();
    expect(mapBookingContractError(null)).toBeUndefined();
    expect(mapBookingContractError('')).toBeUndefined();
  });

  it('assigns the right statusCode per failure category (404 not-found, 403 authorization, 409 conflict, 400 bad input)', () => {
    expect(mapBookingContractError('Booking not found')?.statusCode).toBe(404);
    expect(mapBookingContractError('Not authorized to cancel')?.statusCode).toBe(403);
    expect(mapBookingContractError('Unauthorized oracle')?.statusCode).toBe(403);
    expect(mapBookingContractError('Already paid or cancelled')?.statusCode).toBe(409);
    expect(mapBookingContractError('Invalid refund bps')?.statusCode).toBe(400);
    expect(mapBookingContractError('Empty batch')?.statusCode).toBe(400);
  });

  it('has no panic message that is a substring of another (a real risk with substring matching over a growing table)', () => {
    const messages = Object.keys(BOOKING_CONTRACT_ERRORS);
    for (const a of messages) {
      for (const b of messages) {
        if (a === b) continue;
        expect(b.includes(a)).toBe(false);
      }
    }
  });

  it('does not match an unrelated string that merely shares a common word with a real panic message', () => {
    // "booking" alone should not accidentally satisfy any mapping's substring check.
    expect(mapBookingContractError('the booking service is currently degraded')).toBeUndefined();
  });
});

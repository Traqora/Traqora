import { mapStellarError } from './stellarErrors';

describe('mapStellarError', () => {
  it('returns null for a falsy error', () => {
    expect(mapStellarError(null)).toBeNull();
    expect(mapStellarError(undefined)).toBeNull();
  });

  describe('classic Stellar / Horizon result codes (pre-existing behaviour)', () => {
    it('maps tx_bad_seq via response.data.extras.result_codes', () => {
      const error = {
        message: 'transaction submission failed',
        response: { data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } } },
      };
      const result = mapStellarError(error);
      expect(result?.code).toBe('STELLAR_BAD_SEQUENCE');
    });

    it('is unaffected by #547s contract-error mapping — result_codes is checked first and unconditionally', () => {
      const error = {
        message: 'transaction submission failed',
        response: { data: { extras: { result_codes: { transaction: 'tx_bad_auth' } } } },
      };
      expect(mapStellarError(error)?.code).toBe('STELLAR_BAD_AUTH');
    });
  });

  describe('#547: booking contract error mapping, checked before the generic simulation-failed fallback', () => {
    it('maps a booking-contract panic message with its specific code, message, and statusCode', () => {
      const error = { message: 'Simulation failed: HostError ... "Booking not found" ...' };
      const result = mapStellarError(error);
      expect(result).toEqual({
        code: 'BOOKING_NOT_FOUND',
        message: 'This booking does not exist on-chain.',
        statusCode: 404,
        details: { rawError: error.message },
      });
    });

    it('takes priority over the generic SOROBAN_SIMULATION_FAILED fallback when both could match', () => {
      // This message contains both "simulation failed" (generic fallback trigger)
      // and a recognized contract panic message — the specific mapping must win.
      const error = { message: 'Simulation failed: "No funds in escrow"' };
      const result = mapStellarError(error);
      expect(result?.code).toBe('BOOKING_NO_FUNDS_IN_ESCROW');
      expect(result?.code).not.toBe('SOROBAN_SIMULATION_FAILED');
    });
  });

  describe('generic fallbacks (pre-existing behaviour, unaffected by #547)', () => {
    it('falls back to SOROBAN_SIMULATION_FAILED for an unrecognized simulation failure', () => {
      const error = { message: 'Simulation failed: some future contract error we have not mapped yet' };
      const result = mapStellarError(error);
      expect(result?.code).toBe('SOROBAN_SIMULATION_FAILED');
      // No statusCode on the generic fallback — errorHandler.ts falls back
      // to the thrown error's own statusCode for this case, same as before #547.
      expect(result?.statusCode).toBeUndefined();
    });

    it('maps a Horizon-mentioning message to STELLAR_HORIZON_ERROR', () => {
      expect(mapStellarError({ message: 'could not reach Horizon' })?.code).toBe('STELLAR_HORIZON_ERROR');
    });

    it('maps a "soroban rpc"-mentioning message to SOROBAN_RPC_ERROR', () => {
      expect(mapStellarError({ message: 'soroban rpc request timed out' })?.code).toBe('SOROBAN_RPC_ERROR');
    });

    it('returns null for a completely unrelated error message', () => {
      expect(mapStellarError({ message: 'ECONNREFUSED' })).toBeNull();
    });
  });
});

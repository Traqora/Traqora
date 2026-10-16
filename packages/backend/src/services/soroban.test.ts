import * as StellarSdk from '@stellar/stellar-sdk';

// config is a fully-resolved singleton built from env vars at import time
// (tests/setup.ts already sets the contract-id env vars every test needs).
// Mocked here only to force config.contracts.booking on/off per test,
// since that flag is exactly what decides between the mock-XDR fallback
// path and the real simulate/submit path this file is testing.
// A real, valid Soroban contract address StrKey (checked via
// StrKey.isValidContract before use — see the earlier soroban-keeper-network
// work this session, which found a hand-typed placeholder is not
// automatically a valid checksum).
const TEST_CONTRACT_ID = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';

jest.mock('../config', () => ({
  config: {
    contracts: { booking: 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526' },
    stellarNetwork: 'testnet',
    stellarSecretKey: undefined,
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  },
}));

import { config } from '../config';
import {
  buildBatchBookingActionUnsignedXdr,
  buildCreateBookingUnsignedXdr,
  submitSignedSorobanXdr,
} from './soroban';

const BOOKING_PARAMS = {
  passenger: 'GDMVEPX5MQV3OFOSNOXQTBFZLX72HCNJ5QHLBWBQKRQTAOFT3LHLPW7U',
  airline: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  flightNumber: 'AA100',
  fromAirport: 'JFK',
  toAirport: 'LAX',
  departureTime: 1_800_000_000,
  price: 10_000_000n,
  token: 'NATIVE',
};

function mockSimulationError(errorMessage: string) {
  jest.spyOn(StellarSdk.SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue(
    new StellarSdk.Account(BOOKING_PARAMS.passenger, '0'),
  );
  jest.spyOn(StellarSdk.SorobanRpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
    error: errorMessage,
    events: [],
    _parsed: true,
    id: '1',
    latestLedger: 1000,
  } as unknown as Awaited<ReturnType<StellarSdk.SorobanRpc.Server['simulateTransaction']>>);
  jest.spyOn(StellarSdk.SorobanRpc.Api, 'isSimulationSuccess').mockReturnValue(false);
}

describe('soroban.ts — #547 error propagation (no swallowing real failures into mock XDR)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    (config as { contracts: { booking: string | undefined } }).contracts.booking = TEST_CONTRACT_ID;
  });

  describe('buildCreateBookingUnsignedXdr', () => {
    it('still returns a mock XDR when the contract genuinely is not configured', async () => {
      (config as { contracts: { booking: string | undefined } }).contracts.booking = undefined;
      const result = await buildCreateBookingUnsignedXdr(BOOKING_PARAMS);
      expect(result.xdr).toBeDefined();
      expect(typeof result.xdr).toBe('string');
    });

    it('throws (does not swallow into a mock XDR) when a configured contract rejects the simulation', async () => {
      mockSimulationError('HostError: ... "No funds in escrow" ...');
      await expect(buildCreateBookingUnsignedXdr(BOOKING_PARAMS)).rejects.toThrow(/Simulation failed/);
    });

    it('the thrown error message is exactly what mapBookingContractError needs to recognize the panic', async () => {
      mockSimulationError('HostError: ... "Booking not found" ...');
      await expect(buildCreateBookingUnsignedXdr(BOOKING_PARAMS)).rejects.toThrow(/Booking not found/);
    });
  });

  describe('buildBatchBookingActionUnsignedXdr', () => {
    it('still returns a mock XDR when the contract genuinely is not configured', async () => {
      (config as { contracts: { booking: string | undefined } }).contracts.booking = undefined;
      const result = await buildBatchBookingActionUnsignedXdr({
        actor: BOOKING_PARAMS.passenger,
        bookingIds: [1, 2],
        action: 'batch_release_payments',
      });
      expect(result.xdr).toBeDefined();
    });

    it('throws on an empty bookingIds array rather than silently falling back to mock XDR', async () => {
      await expect(
        buildBatchBookingActionUnsignedXdr({
          actor: BOOKING_PARAMS.passenger,
          bookingIds: [],
          action: 'batch_release_payments',
        }),
      ).rejects.toThrow(/bookingIds must not be empty/);
    });

    it('throws when a configured contract rejects the batch simulation', async () => {
      mockSimulationError('HostError: ... "Batch too large" ...');
      await expect(
        buildBatchBookingActionUnsignedXdr({
          actor: BOOKING_PARAMS.passenger,
          bookingIds: [1, 2, 3],
          action: 'batch_release_payments',
        }),
      ).rejects.toThrow(/Batch too large/);
    });
  });

  describe('submitSignedSorobanXdr', () => {
    it('still returns a mock hash when the contract genuinely is not configured', async () => {
      (config as { contracts: { booking: string | undefined } }).contracts.booking = undefined;
      const result = await submitSignedSorobanXdr('not-real-xdr');
      expect(result.txHash).toBeDefined();
    });

    it('throws (does not swallow into a mock success hash) when the network rejects submission', async () => {
      // A real, well-formed unsigned tx envelope, so TransactionBuilder.fromXDR
      // succeeds and the code path reaches sendTransaction — the actual
      // thing under test is what happens after that call fails, not XDR parsing.
      const account = new StellarSdk.Account(BOOKING_PARAMS.passenger, '0');
      const contract = new StellarSdk.Contract('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4');
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addOperation(contract.call('get_booking', StellarSdk.nativeToScVal(1, { type: 'u64' })))
        .setTimeout(30)
        .build();

      jest
        .spyOn(StellarSdk.SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({ status: 'ERROR', hash: 'deadbeef' } as unknown as Awaited<
          ReturnType<StellarSdk.SorobanRpc.Server['sendTransaction']>
        >);

      await expect(submitSignedSorobanXdr(tx.toXDR())).rejects.toThrow(/Transaction failed/);
    });
  });
});

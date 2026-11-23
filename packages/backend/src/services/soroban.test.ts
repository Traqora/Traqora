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
  getTransactionStatus,
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

    it('attaches a stable booking reference as a MEMO_TEXT (#924)', async () => {
      const addMemo = jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'addMemo');
      mockSimulationError('HostError: simulation stopped');

      await expect(
        buildCreateBookingUnsignedXdr({
          ...BOOKING_PARAMS,
          bookingReference: 'TRQ-ABCDEFGHJKMNPQRS',
        }),
      ).rejects.toThrow(/Simulation failed/);

      expect(addMemo).toHaveBeenCalledTimes(1);
      const memo = addMemo.mock.calls[0][0] as StellarSdk.Memo;
      expect(memo.type).toBe('text');
      expect(memo.value).toBe('TRQ-ABCDEFGHJKMNPQRS');
    });

    it('rejects an oversize booking reference before submitting', async () => {
      await expect(
        buildCreateBookingUnsignedXdr({
          ...BOOKING_PARAMS,
          bookingReference: 'TRQ-' + 'A'.repeat(30),
        }),
      ).rejects.toThrow(/at most 28/);
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

  describe('fee-bump outcomes (#923)', () => {
    function buildFeeBumpXdr(): { feeBump: StellarSdk.FeeBumpTransaction; inner: StellarSdk.Transaction } {
      const account = new StellarSdk.Account(BOOKING_PARAMS.passenger, '0');
      const contract = new StellarSdk.Contract(TEST_CONTRACT_ID);
      const inner = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addOperation(contract.call('get_booking', StellarSdk.nativeToScVal(1, { type: 'u64' })))
        .setTimeout(30)
        .build();
      const feeBump = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
        BOOKING_PARAMS.airline,
        '200',
        inner,
        StellarSdk.Networks.TESTNET,
      );
      return { feeBump, inner };
    }

    it('returns both the outer and inner hashes when a fee-bump envelope is submitted', async () => {
      const { feeBump, inner } = buildFeeBumpXdr();
      jest
        .spyOn(StellarSdk.SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({
          status: 'PENDING',
          hash: feeBump.hash().toString('hex'),
        } as unknown as Awaited<ReturnType<StellarSdk.SorobanRpc.Server['sendTransaction']>>);

      const result = await submitSignedSorobanXdr(feeBump.toXDR());

      expect(result.isFeeBump).toBe(true);
      expect(result.txHash).toBe(feeBump.hash().toString('hex'));
      expect(result.feeBumpTxHash).toBe(feeBump.hash().toString('hex'));
      expect(result.innerTxHash).toBe(inner.hash().toString('hex'));
    });

    it('falls back to the inner transaction status when the outer hash is not found', async () => {
      const { feeBump, inner } = buildFeeBumpXdr();
      const innerHash = inner.hash().toString('hex');
      const outerHash = feeBump.hash().toString('hex');

      jest.spyOn(StellarSdk.SorobanRpc.Server.prototype, 'getTransaction').mockImplementation(
        (async (hash: string) => {
          if (hash === outerHash) {
            return { status: StellarSdk.SorobanRpc.Api.GetTransactionStatus.NOT_FOUND };
          }
          if (hash === innerHash) {
            return {
              status: StellarSdk.SorobanRpc.Api.GetTransactionStatus.SUCCESS,
              returnValue: '42',
            };
          }
          return { status: StellarSdk.SorobanRpc.Api.GetTransactionStatus.NOT_FOUND };
        }) as unknown as StellarSdk.SorobanRpc.Server['getTransaction'],
      );

      const status = await getTransactionStatus(outerHash, {
        innerTxHash: innerHash,
        feeBumpTxHash: outerHash,
      });

      expect(status.status).toBe('success');
      expect(status.observedOn).toBe('inner');
      expect(status.txHash).toBe(outerHash);
      expect(status.innerTxHash).toBe(innerHash);
      expect(status.isFeeBump).toBe(true);
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

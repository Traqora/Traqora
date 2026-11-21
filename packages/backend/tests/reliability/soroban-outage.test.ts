import * as StellarSdk from '@stellar/stellar-sdk';
import {
  buildCreateBookingUnsignedXdr,
  executeSorobanOperation,
  getTransactionStatus,
  submitSignedSorobanXdr,
} from '../../src/services/soroban';
import { AppError } from '../../src/services/ErrorHandlingService';

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: jest.fn(),
    },
  };
});

describe('Stellar RPC outage behavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails transaction preparation explicitly and resumes operations after the RPC recovers', async () => {
    const getAccount = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const getTransaction = jest
      .fn<Promise<{ status: string }>, [string]>()
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const sendTransaction = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const server = {
      getAccount,
      getTransaction,
      sendTransaction,
    } as unknown as StellarSdk.SorobanRpc.Server;
    (StellarSdk.SorobanRpc.Server as unknown as jest.Mock).mockImplementation(() => server);

    await expect(
      buildCreateBookingUnsignedXdr({
        passenger: StellarSdk.Keypair.random().publicKey(),
        airline: StellarSdk.Keypair.random().publicKey(),
        flightNumber: 'TRQ101',
        fromAirport: 'LHR',
        toAirport: 'JFK',
        departureTime: 1_798_790_400,
        price: 25000n,
        token: 'USDC',
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'STELLAR_RPC_UNAVAILABLE',
      retryable: true,
    } satisfies Partial<AppError>);

    const keypair = StellarSdk.Keypair.random();
    const signedTransaction = new StellarSdk.TransactionBuilder(
      new StellarSdk.Account(keypair.publicKey(), '1'),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      },
    )
      .addOperation(
        StellarSdk.Operation.payment({
          destination: StellarSdk.Keypair.random().publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: '1',
        }),
      )
      .setTimeout(30)
      .build();
    signedTransaction.sign(keypair);

    await expect(submitSignedSorobanXdr(signedTransaction.toXDR())).rejects.toMatchObject({
      statusCode: 503,
      code: 'STELLAR_RPC_UNAVAILABLE',
      retryable: true,
    });

    await expect(
      executeSorobanOperation('rpc_recovery_probe', async () => 'recovered'),
    ).resolves.toBe('recovered');

    await expect(getTransactionStatus('test-transaction')).resolves.toMatchObject({
      status: 'pending',
      error: 'Soroban RPC temporarily unavailable',
    });
    getTransaction.mockResolvedValueOnce({
      status: StellarSdk.SorobanRpc.Api.GetTransactionStatus.NOT_FOUND,
    });
    await expect(getTransactionStatus('test-transaction')).resolves.toMatchObject({
      status: 'not_found',
      txHash: 'test-transaction',
    });
  }, 20000);
});

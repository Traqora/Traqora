import {
  Account,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import {
  buildWalletTransactionSummary,
  networkFromPassphrase,
  stroopsToXlm,
  TransactionSummaryError,
} from '@/lib/wallet-transaction';

const SOURCE = 'GDMVEPX5MQV3OFOSNOXQTBFZLX72HCNJ5QHLBWBQKRQTAOFT3LHLPW7U';
const CONTRACT_ID = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';

function createBookingXdr(fee: string = BASE_FEE): string {
  const transaction = new TransactionBuilder(new Account(SOURCE, '0'), {
    fee,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(CONTRACT_ID).call(
        'create_booking',
        nativeToScVal(42, { type: 'u64' }),
      ),
    )
    .setTimeout(300)
    .build();

  return transaction.toXDR();
}

describe('buildWalletTransactionSummary (#936)', () => {
  it('describes the contract action, network, fee, and successful simulation safely', () => {
    const summary = buildWalletTransactionSummary({
      unsignedXdr: createBookingXdr(),
      networkPassphrase: Networks.TESTNET,
      simulation: {
        status: 'success',
        minResourceFee: '5000',
        latestLedger: 12345,
        cost: { cpuIns: '1000', memBytes: '2048' },
      },
    });

    expect(summary.network).toBe('testnet');
    expect(summary.contractId).toBe(CONTRACT_ID);
    expect(summary.contractAction).toBe('create_booking');
    expect(summary.operationType).toBe('invokeHostFunction');
    expect(summary.estimatedFeeStroops).toBe(5100);
    expect(summary.estimatedFeeXlm).toBe('0.00051');
    expect(summary.simulation).toMatchObject({
      available: true,
      status: 'success',
      success: true,
      minResourceFeeStroops: 5000,
      latestLedger: 12345,
      instructions: 1000,
      memoryBytes: 2048,
      error: null,
    });
    expect(summary.summaryLines.join('\n')).toContain('create_booking');
    expect(summary.summaryLines.join('\n')).toContain('0.00051 XLM');
  });

  it('reports a failed simulation without exposing the raw envelope or secret keys', () => {
    const secret = `S${'A'.repeat(55)}`;
    const rawXdr = 'A'.repeat(160);

    const summary = buildWalletTransactionSummary({
      unsignedXdr: createBookingXdr(),
      networkPassphrase: Networks.TESTNET,
      simulation: {
        status: 'failed',
        error: `HostError: no funds; secret=${secret}; envelope=${rawXdr}`,
      },
    });

    expect(summary.simulation.success).toBe(false);
    expect(summary.simulation.status).toBe('failed');
    expect(summary.simulation.error).toContain('[redacted secret]');
    expect(summary.simulation.error).toContain('[redacted payload]');
    expect(summary.simulation.error).not.toContain(secret);
    expect(summary.simulation.error).not.toContain(rawXdr);
  });

  it('marks simulation as not run when the backend did not supply a result', () => {
    const summary = buildWalletTransactionSummary({
      unsignedXdr: createBookingXdr('100'),
      networkPassphrase: Networks.TESTNET,
    });

    expect(summary.simulation.available).toBe(false);
    expect(summary.simulation.status).toBe('not_run');
    expect(summary.estimatedFeeStroops).toBe(100);
  });

  it('throws a safe error for an unreadable envelope', () => {
    expect(() =>
      buildWalletTransactionSummary({
        unsignedXdr: 'not-an-xdr',
        networkPassphrase: Networks.TESTNET,
      }),
    ).toThrow(TransactionSummaryError);
  });
});

describe('wallet transaction helpers', () => {
  it('maps standard passphrases to network names', () => {
    expect(networkFromPassphrase(Networks.TESTNET)).toBe('testnet');
    expect(networkFromPassphrase(Networks.PUBLIC)).toBe('mainnet');
    expect(networkFromPassphrase('unknown')).toBe('unknown');
  });

  it('formats stroops as XLM without trailing zero noise', () => {
    expect(stroopsToXlm(10_000_000)).toBe('1');
    expect(stroopsToXlm(100)).toBe('0.00001');
    expect(stroopsToXlm(0)).toBe('0');
  });
});

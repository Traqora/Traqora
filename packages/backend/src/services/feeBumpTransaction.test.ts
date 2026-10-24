import * as StellarSdk from '@stellar/stellar-sdk';
import {
  describeTransactionEnvelope,
  describeTransactionXdr,
  referenceFromStoredHashes,
  resolveFeeBumpOutcome,
} from './feeBumpTransaction';

const PASSENGER = 'GDMVEPX5MQV3OFOSNOXQTBFZLX72HCNJ5QHLBWBQKRQTAOFT3LHLPW7U';
const FEE_SOURCE = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const CONTRACT_ID = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';
const PASSPHRASE = StellarSdk.Networks.TESTNET;

function buildInnerTransaction(): StellarSdk.Transaction {
  const account = new StellarSdk.Account(PASSENGER, '0');
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  return new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(contract.call('get_booking', StellarSdk.nativeToScVal(1, { type: 'u64' })))
    .addMemo(StellarSdk.Memo.text('TRQ-ABCDEFGHJKMNPQRS'))
    .setTimeout(30)
    .build();
}

describe('fee-bump transaction tracking (#923)', () => {
  it('describes a normal envelope with identical submitted and inner hashes', () => {
    const tx = buildInnerTransaction();
    const reference = describeTransactionEnvelope(tx);

    expect(reference.isFeeBump).toBe(false);
    expect(reference.submittedTxHash).toBe(reference.innerTxHash);
    expect(reference.feeBumpTxHash).toBeUndefined();
  });

  it('captures both hashes for a fee-bump envelope and round-trips through XDR', () => {
    const inner = buildInnerTransaction();
    const feeBump = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      FEE_SOURCE,
      '200',
      inner,
      PASSPHRASE,
    );

    const reference = describeTransactionEnvelope(feeBump);
    expect(reference.isFeeBump).toBe(true);
    expect(reference.feeBumpTxHash).toBe(reference.submittedTxHash);
    expect(reference.innerTxHash).toBe(inner.hash().toString('hex'));
    expect(reference.innerTxHash).not.toBe(reference.submittedTxHash);

    expect(describeTransactionXdr(feeBump.toXDR(), PASSPHRASE)).toEqual(reference);
  });

  it('prefers the outer ledger outcome when it settled', () => {
    const reference = referenceFromStoredHashes({
      submittedTxHash: 'outer',
      innerTxHash: 'inner',
      feeBumpTxHash: 'outer',
    });

    const result = resolveFeeBumpOutcome({
      reference,
      outer: { status: 'success', result: '42' },
      inner: { status: 'failed', error: 'inner failed' },
    });

    expect(result.status).toBe('success');
    expect(result.observedOn).toBe('outer');
    expect(result.txHash).toBe('outer');
    expect(result.innerTxHash).toBe('inner');
    expect(result.isFeeBump).toBe(true);
  });

  it('falls back to the inner outcome when the outer hash is not found', () => {
    const reference = referenceFromStoredHashes({
      submittedTxHash: 'outer',
      innerTxHash: 'inner',
      feeBumpTxHash: 'outer',
    });

    const result = resolveFeeBumpOutcome({
      reference,
      outer: { status: 'not_found' },
      inner: { status: 'success', result: '42' },
    });

    expect(result.status).toBe('success');
    expect(result.observedOn).toBe('inner');
    expect(result.txHash).toBe('outer');
  });

  it('surfaces an inner failure so retries and booking status see it', () => {
    const reference = referenceFromStoredHashes({
      submittedTxHash: 'outer',
      innerTxHash: 'inner',
      feeBumpTxHash: 'outer',
    });

    const result = resolveFeeBumpOutcome({
      reference,
      outer: { status: 'pending' },
      inner: { status: 'failed', error: 'insufficient balance' },
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBe('insufficient balance');
    expect(result.observedOn).toBe('inner');
  });

  it('reports outer pending while both hashes are unsettled', () => {
    const reference = referenceFromStoredHashes({
      submittedTxHash: 'outer',
      innerTxHash: 'inner',
    });

    const result = resolveFeeBumpOutcome({
      reference,
      outer: { status: 'pending' },
      inner: { status: 'not_found' },
    });

    expect(result.status).toBe('pending');
    expect(result.observedOn).toBe('outer');
  });

  it('reports not_found when neither hash is known', () => {
    const reference = referenceFromStoredHashes({ submittedTxHash: 'outer' });
    const result = resolveFeeBumpOutcome({
      reference,
      outer: { status: 'not_found' },
    });

    expect(result.status).toBe('not_found');
    expect(result.observedOn).toBe('outer');
  });

  it('builds a non-fee-bump reference from legacy stored hashes', () => {
    const reference = referenceFromStoredHashes({ submittedTxHash: 'tx' });
    expect(reference).toEqual({
      isFeeBump: false,
      submittedTxHash: 'tx',
      innerTxHash: 'tx',
      feeBumpTxHash: undefined,
    });
  });
});

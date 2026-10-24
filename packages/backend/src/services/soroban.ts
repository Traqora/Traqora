import { config } from '../config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import {
  AppError,
  CircuitBreaker,
  executeWithResilience,
  isTransientError,
} from './ErrorHandlingService';
import { measureAsync } from './metrics';
import { buildBookingMemo } from './bookingReference';
import {
  describeTransactionEnvelope,
  referenceFromStoredHashes,
  resolveFeeBumpOutcome,
  type TransactionStatusLike,
} from './feeBumpTransaction';

/** Blockchain explorer URL for a Stellar/Soroban transaction hash, network-aware. */
export const explorerUrlForTx = (txHash: string): string => {
  const isTestnet = config.stellarNetwork === 'testnet' || config.stellarNetwork === 'standalone';
  const base = isTestnet
    ? 'https://stellar.expert/explorer/testnet/tx'
    : 'https://stellar.expert/explorer/public/tx';
  return `${base}/${txHash}`;
};

export type UnsignedSorobanTx = {
  xdr: string;
  networkPassphrase: string;
  bookingReference?: string;
};

export const buildBatchBookingActionUnsignedXdr = async (params: {
  actor: string;
  bookingIds: number[];
  action: 'batch_release_payments' | 'batch_refund_passenger';
}): Promise<UnsignedSorobanTx> => {
  // Deliberately outside the try block below (#547): this is the ONLY
  // condition that should fall back to a mock XDR — a genuinely
  // unconfigured contract, i.e. local dev with no deployed contract. Every
  // failure that can occur once the contract IS configured (bad params, a
  // simulation rejecting the call, an RPC error) must propagate as a real
  // thrown error instead, mapped via mapStellarError/mapBookingContractError.
  // Previously the outer catch caught everything indiscriminately and
  // returned the same mock-success shape for a genuine contract rejection
  // as it did for "not configured yet" — a caller (e.g. a wallet about to
  // sign and submit this XDR) could not tell a rejected batch action from
  // a valid dev-mode placeholder.
  if (!config.contracts.booking) {
    logger.warn('Booking contract ID not configured, returning mock batch XDR');
    const payload = JSON.stringify({ contract: 'mock', ...params });
    const xdr = Buffer.from(payload, 'utf8').toString('base64');
    return { xdr, networkPassphrase: getNetworkPassphrase() };
  }

  if (!params.bookingIds.length) {
    throw new Error('bookingIds must not be empty');
  }

  const server = getSorobanServer();
  const networkPassphrase = getNetworkPassphrase();
  const sourceAccount = await executeSorobanOperation(
    'soroban_get_account',
    () => server.getAccount(params.actor),
    { actor: params.actor, action: params.action }
  );
  const contract = new StellarSdk.Contract(config.contracts.booking);

  const actorVal = new StellarSdk.Address(params.actor).toScVal();
  // { type: 'u64' } — the ELEMENT type, not { type: { vec: ['u64'] } } — is
  // the shape nativeToScVal actually expects for encoding an array as a
  // Soroban vector (verified directly against the installed SDK: the
  // { vec: [...] } shape throws "type.startsWith is not a function" on
  // every call, unconditionally — this line has never worked with a
  // configured contract, confirmed pre-existing and unrelated to #547 by
  // reproducing the failure against the SDK with no other code involved).
  const bookingIdsVal = StellarSdk.nativeToScVal(params.bookingIds, {
    type: 'u64',
  });

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(params.action, actorVal, bookingIdsVal))
    .setTimeout(300)
    .build();

  const simulated = await executeSorobanOperation(
    'soroban_simulate_batch_action',
    () => server.simulateTransaction(transaction),
    { actor: params.actor, action: params.action }
  );
  if (StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated)) {
    const prepared = StellarSdk.SorobanRpc.assembleTransaction(
      transaction,
      simulated
    ).build();

    return {
      xdr: prepared.toXDR(),
      networkPassphrase,
    };
  }

  logger.error('Batch transaction simulation failed', { error: (simulated as any).error, params });
  throw new Error(`Simulation failed: ${(simulated as any).error || 'Unknown error'}`);
};

export type TransactionStatus = {
  status: 'pending' | 'success' | 'failed' | 'not_found';
  txHash?: string;
  result?: any;
  error?: string;
  /** True when the submitted envelope was a fee-bump transaction (#923). */
  isFeeBump?: boolean;
  /** Hash of the inner transaction; equals txHash for normal transactions. */
  innerTxHash?: string;
  /** Outer fee-bump envelope hash, when applicable. */
  feeBumpTxHash?: string;
  /** Which hash produced the reported status. */
  observedOn?: 'outer' | 'inner';
};

export type SubmittedSorobanTransaction = {
  txHash: string;
  innerTxHash: string;
  feeBumpTxHash?: string;
  isFeeBump: boolean;
  bookingId?: string;
  /** Stable booking reference attached as a memo, when one was supplied. */
  bookingReference?: string;
};

let server: StellarSdk.SorobanRpc.Server | null = null;
const sorobanCircuitBreaker = new CircuitBreaker('soroban-rpc', {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
});

const getSorobanServer = (): StellarSdk.SorobanRpc.Server => {
  if (!server) {
    server = new StellarSdk.SorobanRpc.Server(config.sorobanRpcUrl);
  }
  return server;
};

export const executeSorobanOperation = async <T>(
  operationName: string,
  fn: () => Promise<T>,
  context: Record<string, unknown> = {}
): Promise<T> =>
  measureAsync('soroban', operationName, () =>
    executeWithResilience(sorobanCircuitBreaker, fn, {
      operationName,
      context,
      retry: {
        retries: 3,
        baseDelayMs: 300,
        shouldRetry: (error) => isTransientError(error),
      },
    })
  );

const getNetworkPassphrase = (): string => {
  switch (config.stellarNetwork) {
    case 'mainnet':
    case 'production':
      return StellarSdk.Networks.PUBLIC;
    case 'standalone':
      return StellarSdk.Networks.STANDALONE;
    default:
      return StellarSdk.Networks.TESTNET;
  }
};

export const buildCreateBookingUnsignedXdr = async (params: {
  passenger: string;
  airline: string;
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  departureTime: number;
  price: bigint;
  token: string;
  /** Stable, privacy-safe booking reference to attach as MEMO_TEXT (#924). */
  bookingReference?: string;
}): Promise<UnsignedSorobanTx> => {
  // Validate the memo before any RPC call so oversized or non-ASCII
  // references fail fast and never reach the network (#924).
  const bookingMemo = params.bookingReference
    ? buildBookingMemo(params.bookingReference)
    : undefined;

  // Same fix and reasoning as buildBatchBookingActionUnsignedXdr above
  // (#547): mock-XDR fallback only for "contract not configured", not for
  // every failure indiscriminately.
  if (!config.contracts.booking) {
    logger.warn('Booking contract ID not configured, returning mock XDR');
    // JSON.stringify throws on a bare bigint (params.price is bigint) —
    // this path was unreachable with a real bigint price until #547's
    // tests exercised it; stringify explicitly rather than relying on
    // JSON.stringify's default (which has no bigint handling at all).
    const payload = JSON.stringify({ contract: 'mock', ...params, price: params.price.toString() });
    const xdr = Buffer.from(payload, 'utf8').toString('base64');
    return {
      xdr,
      networkPassphrase: getNetworkPassphrase(),
      bookingReference: params.bookingReference,
    };
  }

  const server = getSorobanServer();
  const networkPassphrase = getNetworkPassphrase();

  // Get source account (fee estimation)
  const sourceAccount = await executeSorobanOperation(
    'soroban_get_account',
    () => server.getAccount(params.passenger),
    { passenger: params.passenger, action: 'create_booking' }
  );

  // Build contract invocation
  const contract = new StellarSdk.Contract(config.contracts.booking);

  // Convert parameters to Soroban types
  const contractParams = [
    new StellarSdk.Address(params.passenger).toScVal(),
    new StellarSdk.Address(params.airline).toScVal(),
    StellarSdk.nativeToScVal(params.flightNumber, { type: 'symbol' }),
    StellarSdk.nativeToScVal(params.fromAirport, { type: 'symbol' }),
    StellarSdk.nativeToScVal(params.toAirport, { type: 'symbol' }),
    StellarSdk.nativeToScVal(params.departureTime, { type: 'u64' }),
    StellarSdk.nativeToScVal(params.price.toString(), { type: 'u64' }),
    StellarSdk.nativeToScVal(params.token, { type: 'symbol' }),
  ];

  // Build the transaction
  const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call('create_booking', ...contractParams)
    )
    .setTimeout(300); // 5 minutes

  if (bookingMemo) {
    builder.addMemo(bookingMemo);
  }

  const transaction = builder.build();

  // Simulate to get accurate fee
  const simulated = await executeSorobanOperation(
    'soroban_simulate_create_booking',
    () => server.simulateTransaction(transaction),
    { passenger: params.passenger, action: 'create_booking' }
  );

  if (StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated)) {
    // Prepare the transaction with simulated results
    const prepared = StellarSdk.SorobanRpc.assembleTransaction(
      transaction,
      simulated
    ).build();

    return {
      xdr: prepared.toXDR(),
      networkPassphrase,
      bookingReference: params.bookingReference,
    };
  }

  logger.error('Transaction simulation failed', { error: simulated.error });
  throw new Error(`Simulation failed: ${simulated.error || 'Unknown error'}`);
};

export const signAndSubmitCreateBooking = async (params: {
  passenger: string;
  airline: string;
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  departureTime: number;
  price: bigint;
  token: string;
  /** Stable, privacy-safe booking reference to attach as MEMO_TEXT (#924). */
  bookingReference?: string;
}): Promise<SubmittedSorobanTransaction> => {
  const bookingMemo = params.bookingReference
    ? buildBookingMemo(params.bookingReference)
    : undefined;

  try {
    if (!config.contracts.booking) {
      logger.warn('Booking contract ID not configured, returning mock hash');
      const txHash = '0x' + crypto.randomBytes(32).toString('hex');
      return {
        txHash,
        innerTxHash: txHash,
        isFeeBump: false,
        bookingId: 'mock-' + Date.now(),
        bookingReference: params.bookingReference,
      };
    }

    const server = getSorobanServer();
    const networkPassphrase = getNetworkPassphrase();
    if (!config.stellarSecretKey) {
      throw new Error('stellarSecretKey is not configured');
    }
    const sourceKeypair = StellarSdk.Keypair.fromSecret(config.stellarSecretKey);
    const sourceAccount = await executeSorobanOperation(
      'soroban_get_account',
      () => server.getAccount(sourceKeypair.publicKey()),
      { action: 'sign_and_submit_create_booking' }
    );

    // Build contract invocation
    const contract = new StellarSdk.Contract(config.contracts.booking);
    
    // Convert parameters to Soroban types
    const contractParams = [
      new StellarSdk.Address(params.passenger).toScVal(),
      new StellarSdk.Address(params.airline).toScVal(),
      StellarSdk.nativeToScVal(params.flightNumber, { type: 'symbol' }),
      StellarSdk.nativeToScVal(params.fromAirport, { type: 'symbol' }),
      StellarSdk.nativeToScVal(params.toAirport, { type: 'symbol' }),
      StellarSdk.nativeToScVal(params.departureTime, { type: 'u64' }),
      StellarSdk.nativeToScVal(params.price.toString(), { type: 'u64' }),
      StellarSdk.nativeToScVal(params.token, { type: 'symbol' }),
    ];

    // Build the transaction
    const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        contract.call('create_booking', ...contractParams)
      )
      .setTimeout(300);

    if (bookingMemo) {
      builder.addMemo(bookingMemo);
    }

    const transaction = builder.build();

    // Simulate and prepare
    const simulated = await executeSorobanOperation(
      'soroban_simulate_signed_create_booking',
      () => server.simulateTransaction(transaction),
      { action: 'sign_and_submit_create_booking' }
    );
    if (!StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated)) {
      throw new Error(`Simulation failed: ${simulated.error || 'Unknown error'}`);
    }

    const prepared = StellarSdk.SorobanRpc.assembleTransaction(transaction, simulated).build();
    prepared.sign(sourceKeypair);

    // Submit
    const response = await executeSorobanOperation(
      'soroban_send_signed_create_booking',
      () => server.sendTransaction(prepared),
      { action: 'sign_and_submit_create_booking' }
    );
    if (response.status === 'ERROR') {
      throw new Error(`Submission failed: ${response.status}`);
    }

    // Note: We don't wait for completion here, we return the hash.
    // The orchestration service will poll for status.
    const reference = describeTransactionEnvelope(prepared);
    return {
      txHash: response.hash || reference.submittedTxHash,
      innerTxHash: reference.innerTxHash,
      feeBumpTxHash: reference.feeBumpTxHash,
      isFeeBump: reference.isFeeBump,
      bookingReference: params.bookingReference,
    };
  } catch (error: any) {
    logger.error('Error in signAndSubmitCreateBooking', { error: error.message });
    throw error;
  }
};

export const submitSignedSorobanXdr = async (signedXdr: string): Promise<SubmittedSorobanTransaction> => {
  // Same fix and reasoning as the build*UnsignedXdr functions above
  // (#547) — and the highest-stakes instance of it: this function submits
  // a user's already-signed payment transaction
  // (api/routes/bookings.ts's POST /:id/submit-onchain), so silently
  // returning a mock success hash on a genuine submission failure
  // previously meant a booking could be marked "onchain_submitted" with a
  // fake txHash when the real submission was actually rejected — the
  // caller's withRetries wrapper never saw a rejection to retry, either.
  if (!config.contracts.booking) {
    logger.warn('Booking contract ID not configured, returning mock hash');
    const txHash = '0x' + Buffer.from(signedXdr, 'utf8').toString('hex').slice(0, 64);
    return { txHash, innerTxHash: txHash, isFeeBump: false };
  }

  const server = getSorobanServer();
  const transaction = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    getNetworkPassphrase()
  );
  const reference = describeTransactionEnvelope(transaction);

  // Submit transaction
  const response = await executeSorobanOperation(
    'soroban_submit_signed_xdr',
    () => server.sendTransaction(transaction),
    { action: 'submit_signed_xdr' }
  );

  // response.status type may not include SUCCESS/PENDING in typings
  const status: any = response.status;
  if (status === 'PENDING' || status === 'SUCCESS') {
    logger.info('Transaction submitted successfully', {
      hash: response.hash,
      isFeeBump: reference.isFeeBump,
    });
    return {
      txHash: response.hash || reference.submittedTxHash,
      innerTxHash: reference.innerTxHash,
      feeBumpTxHash: reference.feeBumpTxHash,
      isFeeBump: reference.isFeeBump,
    };
  }

  logger.error('Transaction submission failed', { response });
  throw new Error(`Transaction failed: ${response.status}`);
};

const queryTransactionStatus = async (txHash: string): Promise<TransactionStatusLike> => {
  const server = getSorobanServer();
  const response = await executeSorobanOperation(
    'soroban_get_transaction',
    () => server.getTransaction(txHash),
    { txHash }
  );

  if (response.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    return {
      status: 'success',
      txHash,
      result: response.returnValue,
    };
  }
  if (response.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.FAILED) {
    return {
      status: 'failed',
      txHash,
      error: 'Transaction failed',
    };
  }
  if (response.status === StellarSdk.SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
    return { status: 'not_found', txHash };
  }
  return { status: 'pending', txHash };
};

/**
 * Resolve a transaction's final status. For fee-bump envelopes both the outer
 * and inner hashes are consulted so a retry that submitted either hash still
 * converges on the ledger's actual outcome (#923).
 */
export const getTransactionStatus = async (
  txHash: string,
  options: { innerTxHash?: string | null; feeBumpTxHash?: string | null } = {},
): Promise<TransactionStatus> => {
  if (!config.contracts.booking || txHash.startsWith('0x')) {
    // Mock transaction for development
    return {
      status: 'success',
      txHash,
      result: { bookingId: '1' },
      isFeeBump: false,
      innerTxHash: options.innerTxHash ?? txHash,
      feeBumpTxHash: options.feeBumpTxHash ?? undefined,
      observedOn: 'outer',
    };
  }

  const reference = referenceFromStoredHashes({
    submittedTxHash: txHash,
    innerTxHash: options.innerTxHash,
    feeBumpTxHash: options.feeBumpTxHash,
  });

  let outer: TransactionStatusLike | undefined;
  let outerError: any;
  try {
    outer = await queryTransactionStatus(txHash);
  } catch (error: any) {
    outerError = error;
  }

  const outerSettled = outer?.status === 'success' || outer?.status === 'failed';
  const distinctInner =
    reference.innerTxHash && reference.innerTxHash !== txHash
      ? reference.innerTxHash
      : undefined;

  let inner: TransactionStatusLike | undefined;
  let innerError: any;
  if (!outerSettled && distinctInner) {
    try {
      inner = await queryTransactionStatus(distinctInner);
    } catch (error: any) {
      innerError = error;
    }
  }

  if (!outer && !inner) {
    const error = outerError || innerError;
    const errorMessage = error?.message || 'Unknown error';
    logger.error('Error getting transaction status', { error: errorMessage, txHash });
    if (error instanceof AppError && error.code === 'CIRCUIT_OPEN') {
      return {
        status: 'pending',
        txHash,
        error: 'Soroban RPC temporarily unavailable',
        isFeeBump: reference.isFeeBump,
        innerTxHash: reference.innerTxHash,
        feeBumpTxHash: reference.feeBumpTxHash,
      };
    }

    return {
      status: 'not_found',
      txHash,
      error: errorMessage,
      isFeeBump: reference.isFeeBump,
      innerTxHash: reference.innerTxHash,
      feeBumpTxHash: reference.feeBumpTxHash,
    };
  }

  if (outerError && outer?.status !== 'success' && outer?.status !== 'failed') {
    logger.error('Error getting outer transaction status', {
      error: outerError.message,
      txHash,
    });
  }
  if (innerError && inner?.status !== 'success' && inner?.status !== 'failed') {
    logger.error('Error getting inner transaction status', {
      error: innerError.message,
      txHash: distinctInner,
    });
  }

  const resolved = resolveFeeBumpOutcome({ reference, outer, inner });
  return {
    ...resolved,
    txHash: resolved.txHash,
  };
};

export interface TransactionReceiptData {
  bookingId: string;
  bookingStatus: string;
  amountCents: number;
  passengerName: string;
  flightNumber: string;
  airlineCode: string;
  fromAirport: string;
  toAirport: string;
  departureTime: Date;
  txHash: string;
  explorerUrl: string;
  createdAt: Date;
}

/** Renders a printable PDF receipt for an on-chain booking transaction. */
export const generateTransactionReceiptPdf = async (data: TransactionReceiptData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [400, 600], margin: 24 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Transaction Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`${data.fromAirport}  ->  ${data.toAirport}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(10);
    doc.text(`Booking ID: ${data.bookingId}`);
    doc.text(`Status: ${data.bookingStatus}`);
    doc.text(`Passenger: ${data.passengerName}`);
    doc.text(`Flight: ${data.airlineCode}${data.flightNumber}`);
    doc.text(`Departure: ${data.departureTime.toISOString()}`);
    doc.text(`Amount: $${(data.amountCents / 100).toFixed(2)}`);
    doc.moveDown();
    doc.text(`Transaction Hash: ${data.txHash}`);
    doc.text(`Explorer: ${data.explorerUrl}`, { link: data.explorerUrl, underline: true });
    doc.moveDown();
    doc.fontSize(8).fillColor('gray').text(`Issued ${data.createdAt.toISOString()}`, { align: 'center' });

    doc.end();
  });
};

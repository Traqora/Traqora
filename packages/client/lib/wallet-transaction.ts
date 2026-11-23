/**
 * Safe, presentation-ready summaries of Soroban transactions before a wallet
 * signature is requested (#936).
 *
 * This module is deliberately pure and does not touch the network. It parses
 * the already-built unsigned XDR and the optional simulation result returned
 * by the backend, then exposes only the fields a user needs to make an
 * informed approval decision. Raw transaction envelopes, contract data,
 * authorization entries, and secret-looking values are never included.
 */

import {
  Address,
  FeeBumpTransaction,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

export type SupportedTransactionNetwork =
  | 'testnet'
  | 'mainnet'
  | 'standalone'
  | 'unknown';

export interface SorobanSimulationDetails {
  /** Whether a simulation result was supplied with the transaction. */
  available: boolean;
  status: 'success' | 'failed' | 'not_run';
  success: boolean;
  /** Resource fee reported by Soroban, in stroops. */
  minResourceFeeStroops: number | null;
  /** Estimated total network fee, in stroops. */
  estimatedFeeStroops: number;
  /** Estimated total network fee, in XLM. */
  estimatedFeeXlm: string;
  latestLedger: number | null;
  /** CPU instructions consumed by the simulated invocation. */
  instructions: number | null;
  /** Memory bytes consumed by the simulated invocation. */
  memoryBytes: number | null;
  /** Sanitized, user-safe simulation error (never the raw envelope). */
  error: string | null;
}

export interface WalletTransactionSummary {
  network: SupportedTransactionNetwork;
  networkPassphrase: string;
  /** Contract invoked by the transaction, when it is a Soroban invocation. */
  contractId: string | null;
  /** Contract function invoked, e.g. `create_booking`. */
  contractAction: string | null;
  /** Operation type, e.g. `invokeHostFunction`. */
  operationType: string;
  operationCount: number;
  sourceAccount: string;
  /** Estimated network fee, in stroops and XLM. */
  estimatedFeeStroops: number;
  estimatedFeeXlm: string;
  simulation: SorobanSimulationDetails;
  /** Concise, safe lines suitable for rendering in an approval dialog. */
  summaryLines: string[];
}

/**
 * Shape accepted from the backend. Both the assembled Soroban RPC simulation
 * response (`minResourceFee`, `cost`, `error`) and a pre-normalized simulation
 * (`success`, `estimatedFeeStroops`) are supported.
 */
export interface SimulationSource {
  status?: string;
  success?: boolean;
  error?: unknown;
  minResourceFee?: string | number | null;
  latestLedger?: number | null;
  cost?: {
    cpuIns?: string | number | null;
    memBytes?: string | number | null;
  } | null;
  instructions?: string | number | null;
  memoryBytes?: string | number | null;
  estimatedFeeStroops?: string | number | null;
}

export interface BuildWalletTransactionSummaryInput {
  unsignedXdr: string;
  networkPassphrase: string;
  simulation?: SimulationSource | null;
}

export class TransactionSummaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionSummaryError';
  }
}

const XLM_STROOPS = 10_000_000;
const MAX_ERROR_LENGTH = 240;

const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const STELLAR_PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const STELLAR_STANDALONE_PASSPHRASE = 'Standalone Network ; February 2017';

export function networkFromPassphrase(
  passphrase: string,
): SupportedTransactionNetwork {
  switch (passphrase) {
    case STELLAR_TESTNET_PASSPHRASE:
      return 'testnet';
    case STELLAR_PUBLIC_PASSPHRASE:
      return 'mainnet';
    case STELLAR_STANDALONE_PASSPHRASE:
      return 'standalone';
    default:
      return 'unknown';
  }
}

export function stroopsToXlm(stroops: number): string {
  if (!Number.isFinite(stroops) || stroops < 0) return '0';
  return (stroops / XLM_STROOPS)
    .toFixed(7)
    .replace(/\.?0+$/, '');
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Remove values that must never be shown to a user: Stellar secret keys and
 * long base64/XDR blobs. The result is also length-bounded so a malformed
 * host error cannot flood the approval dialog.
 */
export function sanitizeSimulationError(error: unknown): string | null {
  if (error === null || error === undefined || error === '') return null;

  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (typeof error === 'object') {
    const candidate = (error as { message?: unknown }).message;
    message = typeof candidate === 'string' ? candidate : 'Simulation failed';
  } else {
    message = String(error);
  }

  const sanitized = message
    .replace(/S[A-Z2-7]{55}/g, '[redacted secret]')
    .replace(/[A-Za-z0-9+/]{100,}={0,2}/g, '[redacted payload]')
    .trim();

  if (!sanitized) return 'Simulation failed';
  return sanitized.length > MAX_ERROR_LENGTH
    ? `${sanitized.slice(0, MAX_ERROR_LENGTH)}…`
    : sanitized;
}

function unwrapTransaction(
  transaction: Transaction | FeeBumpTransaction,
): Transaction {
  return transaction instanceof FeeBumpTransaction
    ? transaction.innerTransaction
    : transaction;
}


interface ContractInvocation {
  contractAddress: unknown;
  functionName: { toString(): string };
}

interface InvocationDetails {
  contractId: string | null;
  contractAction: string | null;
  operationType: string;
}

function describeInvocation(transaction: Transaction): InvocationDetails {
  const operation = transaction.operations[0];
  if (!operation) {
    return {
      contractId: null,
      contractAction: null,
      operationType: 'unknown',
    };
  }

  if (operation.type !== 'invokeHostFunction') {
    return {
      contractId: null,
      contractAction: null,
      operationType: operation.type,
    };
  }

  try {
    // stellar-sdk v12 exposes decoded XDR unions (`switch()`/`invokeContract()`),
    // while v17 exposes friendlier wrapper objects (`type`/`invokeContract`).
    const func = operation.func as unknown as {
      switch?: () => { name: string };
      type?: string;
      invokeContract?: (() => ContractInvocation) | ContractInvocation;
    };
    const hostFunctionType = func.switch?.().name ?? func.type;
    if (hostFunctionType !== 'hostFunctionTypeInvokeContract') {
      return {
        contractId: null,
        contractAction: null,
        operationType: operation.type,
      };
    }

    const invocation =
      typeof func.invokeContract === 'function'
        ? func.invokeContract()
        : func.invokeContract;
    if (!invocation) throw new Error('Missing contract invocation');

    return {
      contractId: Address.fromScAddress(
        invocation.contractAddress as Parameters<
          typeof Address.fromScAddress
        >[0],
      ).toString(),
      contractAction: invocation.functionName.toString(),
      operationType: operation.type,
    };
  } catch {
    return {
      contractId: null,
      contractAction: null,
      operationType: operation.type,
    };
  }
}

function normaliseSimulation(
  simulation: SimulationSource | null | undefined,
  transactionFeeStroops: number,
  networkBaseFeeStroops: number,
): SorobanSimulationDetails {
  const available =
    simulation !== null &&
    simulation !== undefined &&
    (simulation.status !== undefined ||
      simulation.success !== undefined ||
      simulation.error !== undefined ||
      simulation.minResourceFee !== undefined ||
      simulation.cost !== undefined ||
      simulation.estimatedFeeStroops !== undefined);

  const minResourceFee =
    toFiniteNumber(simulation?.minResourceFee) ?? null;
  const explicitFee = toFiniteNumber(simulation?.estimatedFeeStroops);

  const estimatedFeeStroops =
    explicitFee ??
    Math.max(
      transactionFeeStroops,
      minResourceFee === null
        ? transactionFeeStroops
        : networkBaseFeeStroops + minResourceFee,
    );

  const error = sanitizeSimulationError(simulation?.error);
  const failed =
    simulation?.success === false ||
    simulation?.status?.toLowerCase() === 'failed' ||
    Boolean(error);

  const status: SorobanSimulationDetails['status'] = !available
    ? 'not_run'
    : failed
      ? 'failed'
      : 'success';

  return {
    available,
    status,
    success: status === 'success',
    minResourceFeeStroops: minResourceFee,
    estimatedFeeStroops,
    estimatedFeeXlm: stroopsToXlm(estimatedFeeStroops),
    latestLedger: toFiniteNumber(simulation?.latestLedger),
    instructions:
      toFiniteNumber(simulation?.instructions) ??
      toFiniteNumber(simulation?.cost?.cpuIns),
    memoryBytes:
      toFiniteNumber(simulation?.memoryBytes) ??
      toFiniteNumber(simulation?.cost?.memBytes),
    error,
  };
}

function buildSummaryLines(
  summary: Omit<WalletTransactionSummary, 'summaryLines'>,
): string[] {
  const lines = [
    `Network: ${summary.network === 'unknown' ? 'Unknown' : summary.network}`,
    `Contract action: ${summary.contractAction ?? 'Unknown'}`,
    `Contract: ${summary.contractId ?? 'Unknown'}`,
    `Estimated network fee: ${summary.estimatedFeeXlm} XLM`,
  ];

  if (summary.simulation.available) {
    lines.push(
      summary.simulation.success
        ? 'Simulation: passed'
        : `Simulation: failed${summary.simulation.error ? ` — ${summary.simulation.error}` : ''}`,
    );
  } else {
    lines.push('Simulation: not available');
  }

  return lines;
}

/**
 * Parse an unsigned Soroban XDR into a safe display summary. Throws a
 * `TransactionSummaryError` when the envelope cannot be read; callers must not
 * request a wallet signature in that case.
 */
export function buildWalletTransactionSummary(
  input: BuildWalletTransactionSummaryInput,
): WalletTransactionSummary {
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(
      input.unsignedXdr,
      input.networkPassphrase,
    );
  } catch {
    throw new TransactionSummaryError(
      'Unable to read the transaction details. Please refresh and try again.',
    );
  }

  const transaction = unwrapTransaction(parsed);
  const operationCount = transaction.operations.length;
  const transactionFeeStroops = toFiniteNumber(transaction.fee) ?? 0;
  const networkBaseFeeStroops = 100 * Math.max(operationCount, 1);
  const invocation = describeInvocation(transaction);
  const simulation = normaliseSimulation(
    input.simulation,
    transactionFeeStroops,
    networkBaseFeeStroops,
  );

  const summary = {
    network: networkFromPassphrase(input.networkPassphrase),
    networkPassphrase: input.networkPassphrase,
    contractId: invocation.contractId,
    contractAction: invocation.contractAction,
    operationType: invocation.operationType,
    operationCount,
    sourceAccount: transaction.source,
    estimatedFeeStroops: simulation.estimatedFeeStroops,
    estimatedFeeXlm: simulation.estimatedFeeXlm,
    simulation,
  };

  return {
    ...summary,
    summaryLines: buildSummaryLines(summary),
  };
}

/** Alias kept for call sites that prefer the shorter name. */
export const buildTransactionSummary = buildWalletTransactionSummary;

/** Return only the safe simulation portion of a transaction summary. */
export function getSorobanSimulationDetails(
  input: BuildWalletTransactionSummaryInput,
): SorobanSimulationDetails {
  return buildWalletTransactionSummary(input).simulation;
}

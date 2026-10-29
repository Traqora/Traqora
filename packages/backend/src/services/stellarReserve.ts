import { AppError } from './ErrorHandlingService';

/**
 * Stellar minimum-reserve check (#920).
 *
 * Estimate whether a source account can pay a transaction fee and still
 * satisfy the classic minimum balance before anyone is asked to sign.
 *
 * Formula (protocol base reserve of 0.5 XLM = 5_000_000 stroops):
 *   entries  = max(0, 2 + subentries + extra subentries + sponsoring - sponsored)
 *   minimum  = entries * base reserve
 *   The account can sign only when native balance - fee >= minimum.
 *
 * Failure: native balance is present and the inequality fails. The thrown
 * error is STELLAR_INSUFFICIENT_RESERVE (HTTP 422) and carries the stroop
 * figures. Callers retry by funding the account or dropping the extra
 * subentries, then building the transaction again. Do not ask the wallet
 * to sign after this error.
 *
 * When the account snapshot has no native balance (Soroban RPC getAccount
 * often returns only sequence), the check is skipped and returns null.
 * A missing snapshot is not treated as success of the payment; it means
 * the reserve cannot be estimated yet. Pass a Horizon-style balance
 * snapshot in `reserveAccount` when the RPC account omits balances.
 */

export const BASE_RESERVE_STROOPS = 5_000_000n;
export const BASE_FEE_STROOPS = 100n;

export interface ReserveAccountView {
  balances?: Array<{ asset_type?: string; assetType?: string; balance?: string }>;
  subentry_count?: number;
  subentryCount?: number;
  num_sponsoring?: number;
  numSponsoring?: number;
  num_sponsored?: number;
  numSponsored?: number;
}

export interface ReserveImpact {
  nativeBalanceStroops: bigint;
  minimumReserveStroops: bigint;
  feeStroops: bigint;
  spendableAfterFeeStroops: bigint;
  sufficient: boolean;
}

export class InsufficientReserveError extends AppError {
  constructor(impact: ReserveImpact) {
    super(
      'Source account balance would fall below the Stellar minimum reserve. Fund the account before signing.',
      {
        statusCode: 422,
        code: 'STELLAR_INSUFFICIENT_RESERVE',
        details: {
          nativeBalanceStroops: impact.nativeBalanceStroops.toString(),
          minimumReserveStroops: impact.minimumReserveStroops.toString(),
          feeStroops: impact.feeStroops.toString(),
          spendableAfterFeeStroops: impact.spendableAfterFeeStroops.toString(),
        },
      },
    );
    this.name = 'InsufficientReserveError';
  }
}

/** Decimal XLM (Horizon balance string) to stroops. Null when unparseable. */
export function xlmToStroops(balance: string): bigint | null {
  const trimmed = balance.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = `${frac}0000000`.slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(fracPadded);
}

export function feeStroopsFrom(fee: string | number | undefined | null): bigint {
  const text = fee == null ? '' : String(fee);
  if (/^\d+$/.test(text)) return BigInt(text);
  return BASE_FEE_STROOPS;
}

function asView(account: unknown): ReserveAccountView | null {
  if (!account || typeof account !== 'object') return null;
  return account as ReserveAccountView;
}

/**
 * Returns null when the snapshot has no readable native balance.
 * Otherwise returns the reserve impact. `sufficient` is false when the
 * fee would push the account under the minimum balance.
 */
export function estimateReserveImpact(
  account: unknown,
  options: {
    feeStroops?: bigint;
    additionalSubentries?: number;
    baseReserveStroops?: bigint;
  } = {},
): ReserveImpact | null {
  const view = asView(account);
  if (!view) return null;
  const native = (view.balances ?? []).find(
    (balance) => (balance.asset_type ?? balance.assetType) === 'native',
  );
  if (!native?.balance) return null;
  const nativeBalanceStroops = xlmToStroops(native.balance);
  if (nativeBalanceStroops == null) return null;

  const subentries = view.subentry_count ?? view.subentryCount ?? 0;
  const sponsoring = view.num_sponsoring ?? view.numSponsoring ?? 0;
  const sponsored = view.num_sponsored ?? view.numSponsored ?? 0;
  const extra = options.additionalSubentries ?? 0;
  const entries = Math.max(0, 2 + subentries + extra + sponsoring - sponsored);
  const base = options.baseReserveStroops ?? BASE_RESERVE_STROOPS;
  const feeStroops = options.feeStroops ?? BASE_FEE_STROOPS;
  const minimumReserveStroops = BigInt(entries) * base;
  const spendableAfterFeeStroops = nativeBalanceStroops - feeStroops;

  return {
    nativeBalanceStroops,
    minimumReserveStroops,
    feeStroops,
    spendableAfterFeeStroops,
    sufficient: spendableAfterFeeStroops >= minimumReserveStroops,
  };
}

/**
 * Throws InsufficientReserveError before a signature is requested.
 * Returns null when the reserve cannot be estimated from this snapshot.
 */
export function assertSourceCanCoverReserve(
  account: unknown,
  options: {
    feeStroops?: bigint;
    additionalSubentries?: number;
    baseReserveStroops?: bigint;
  } = {},
): ReserveImpact | null {
  const impact = estimateReserveImpact(account, options);
  if (!impact) return null;
  if (!impact.sufficient) throw new InsufficientReserveError(impact);
  return impact;
}

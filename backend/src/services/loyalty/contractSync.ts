import { config } from '../../config';
import { LoyaltyStore } from './store';
import { logger } from '../../utils/logger';

export interface OnChainAccount {
  address: string;
  tier: string;
  totalPoints: number;
  lifetimeBookings: number;
  lifetimeSpent: number;
}

export interface SyncResult {
  userId: string;
  synced: boolean;
  onChainPoints?: number;
  offChainPoints: number;
  discrepancy?: number;
  error?: string;
}

/**
 * Synchronises off-chain loyalty state with the Soroban loyalty contract.
 *
 * Read operations (reconcile) use `simulateTransaction` so no signing is
 * required. Write operations (buildAwardTransaction) return unsigned XDR
 * that must be signed by the caller before submission.
 */
export class ContractSync {
  private store: LoyaltyStore;
  private contractId: string;

  constructor(store: LoyaltyStore) {
    this.store = store;
    this.contractId = config.contracts.loyalty;
  }

  /** Check whether the loyalty contract is configured and reachable. */
  isConfigured(): boolean {
    return Boolean(this.contractId && config.sorobanRpcUrl);
  }

  /**
   * Read the on-chain loyalty account for a Stellar address.
   * Returns `null` when the contract is not configured or the account
   * does not exist on-chain.
   */
  async fetchOnChainAccount(
    stellarAddress: string,
  ): Promise<OnChainAccount | null> {
    if (!this.isConfigured()) {
      logger.warn('Loyalty contract not configured — skipping on-chain fetch');
      return null;
    }

    try {
      const { SorobanRpc, Contract, Address } = await import(
        '@stellar/stellar-sdk'
      );

      const server = new SorobanRpc.Server(config.sorobanRpcUrl);
      const contract = new Contract(this.contractId);
      const address = new Address(stellarAddress);

      const call = contract.call('get_account', address.toScVal());
      const simResponse = await server.simulateTransaction(call as never);

      if ('error' in simResponse) {
        logger.warn({ msg: 'Contract simulation failed', error: simResponse.error });
        return null;
      }

      const responseAny = simResponse as unknown as Record<string, unknown>;
      return this.parseAccountResponse(responseAny.result, stellarAddress);
    } catch (err) {
      logger.error({
        msg: 'Failed to fetch on-chain account',
        stellarAddress,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Compare off-chain and on-chain points balances and report any
   * discrepancy so that operators can decide on corrective action.
   */
  async reconcile(userId: string, stellarAddress: string): Promise<SyncResult> {
    const account = this.store.getAccount(userId);
    const offChainPoints = account?.totalPoints ?? 0;

    if (!this.isConfigured()) {
      return {
        userId,
        synced: false,
        offChainPoints,
        error: 'Loyalty contract not configured',
      };
    }

    try {
      const onChain = await this.fetchOnChainAccount(stellarAddress);

      if (!onChain) {
        return {
          userId,
          synced: false,
          offChainPoints,
          error: 'On-chain account not found',
        };
      }

      const discrepancy = offChainPoints - onChain.totalPoints;

      if (discrepancy !== 0) {
        logger.warn({
          msg: 'Points discrepancy detected',
          userId,
          onChain: onChain.totalPoints,
          offChain: offChainPoints,
          discrepancy,
        });
      }

      return {
        userId,
        synced: discrepancy === 0,
        onChainPoints: onChain.totalPoints,
        offChainPoints,
        discrepancy,
      };
    } catch (err) {
      return {
        userId,
        synced: false,
        offChainPoints,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Build an unsigned `award_points` Soroban transaction.
   *
   * The returned base-64 XDR must be signed by the source account
   * (e.g. via Freighter) before being submitted to the network.
   */
  async buildAwardTransaction(
    stellarAddress: string,
    bookingAmount: number,
    bookingId: number,
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      logger.warn('Loyalty contract not configured — cannot build transaction');
      return null;
    }

    try {
      const { Contract, Address, nativeToScVal } = await import(
        '@stellar/stellar-sdk'
      );

      const contract = new Contract(this.contractId);
      const address = new Address(stellarAddress);

      const operation = contract.call(
        'award_points',
        address.toScVal(),
        nativeToScVal(bookingAmount, { type: 'i128' }),
        nativeToScVal(bookingId, { type: 'u64' }),
      );

      return operation.toXDR('base64');
    } catch (err) {
      logger.error({
        msg: 'Failed to build award transaction',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private parseAccountResponse(
    result: unknown,
    stellarAddress: string,
  ): OnChainAccount | null {
    if (!result || typeof result !== 'object') return null;

    const raw = result as Record<string, unknown>;
    return {
      address: stellarAddress,
      tier: String(raw.tier ?? 'bronze'),
      totalPoints: Number(raw.total_points ?? 0),
      lifetimeBookings: Number(raw.lifetime_bookings ?? 0),
      lifetimeSpent: Number(raw.lifetime_spent ?? 0),
    };
  }
}

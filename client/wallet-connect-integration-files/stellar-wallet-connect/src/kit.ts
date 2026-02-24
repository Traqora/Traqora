/**
 * Stellar Wallet Connect - Kit Initialisation & Transaction Signing
 *
 * Wraps `@creit-tech/stellar-wallets-kit` to provide a single
 * initialisation entry-point and a transaction signing helper.
 */

import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit-tech/stellar-wallets-kit/modules/utils';
import { Networks } from '@stellar/stellar-sdk';
import type { StellarNetwork, SignTransactionOptions } from './types';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let isInitialized = false;
let initializationError: Error | null = null;
let configuredNetwork: StellarNetwork = 'testnet';

const networkPassphraseMap: Record<StellarNetwork, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Initialise the StellarWalletsKit singleton.
 *
 * Safe to call multiple times -- only the first invocation performs work.
 * Must be called on the **client side** only.
 *
 * @param network - `'testnet'` (default) or `'mainnet'`.
 */
export function initializeWalletKit(network: StellarNetwork = 'testnet'): void {
  if (typeof window === 'undefined') return; // SSR guard

  if (!isInitialized) {
    try {
      configuredNetwork = network;
      StellarWalletsKit.init({
        modules: defaultModules(),
        network: networkPassphraseMap[network],
      });
      isInitialized = true;
      initializationError = null;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to initialize StellarWalletsKit';
      initializationError = new Error(message);
      console.error('Failed to initialize StellarWalletsKit:', {
        error,
        message,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });
      throw initializationError;
    }
  }
}

/** Whether the kit has been successfully initialised. */
export function isWalletKitInitialized(): boolean {
  return isInitialized;
}

/** The initialisation error, if any. */
export function getInitializationError(): Error | null {
  return initializationError;
}

/** The currently configured network. */
export function getConfiguredNetwork(): StellarNetwork {
  return configuredNetwork;
}

/**
 * Return the `StellarWalletsKit` class reference (for advanced usage).
 *
 * Initialises the kit if it hasn't been already.
 */
export function getKit() {
  if (typeof window === 'undefined') {
    throw new Error('StellarWalletsKit can only be used on the client side');
  }
  if (!isInitialized) {
    initializeWalletKit();
  }
  return StellarWalletsKit;
}

/**
 * Sign a Stellar transaction XDR with the connected wallet.
 *
 * @returns The signed transaction XDR string.
 */
export async function signTransaction({
  unsignedTransaction,
  address,
  network,
}: SignTransactionOptions): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('signTransaction can only be called on the client side');
  }

  if (!isInitialized) {
    initializeWalletKit();
  }

  const passphrase = networkPassphraseMap[network ?? configuredNetwork];

  const { signedTxXdr } = await StellarWalletsKit.signTransaction(
    unsignedTransaction,
    { address, networkPassphrase: passphrase }
  );

  return signedTxXdr;
}

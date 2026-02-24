/**
 * Stellar Wallet Connect
 *
 * A self-contained package for connecting Stellar wallets in React / Next.js
 * applications using `@creit-tech/stellar-wallets-kit`.
 *
 * @example
 * ```tsx
 * import {
 *   useWallet,
 *   useWalletStore,
 *   initializeWalletKit,
 *   signTransaction,
 *   WalletInfo,
 *   WalletConnectionPrompt,
 * } from '@pacto-p2p/stellar-wallet-connect';
 * ```
 */

// ---- Types ----
export type {
  StellarNetwork,
  WalletState,
  WalletActions,
  WalletStore,
  WalletKitOptions,
  SignTransactionOptions,
  UseWalletReturn,
  WalletInfoProps,
  WalletConnectionPromptProps,
} from './types';

// ---- Store ----
export { default as useWalletStore } from './store';

// ---- Kit (init, sign, helpers) ----
export {
  initializeWalletKit,
  isWalletKitInitialized,
  getInitializationError,
  getConfiguredNetwork,
  getKit,
  signTransaction,
} from './kit';

// ---- React Hook ----
export { useWallet } from './use-wallet';

// ---- UI Components ----
export { WalletInfo } from './components/WalletInfo';
export { WalletConnectionPrompt } from './components/WalletConnectionPrompt';

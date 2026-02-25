/**
 * Stellar Wallet Connect - Type Definitions
 *
 * All types used across the wallet connect feature.
 */

/** Supported Stellar network identifiers. */
export type StellarNetwork = 'testnet' | 'mainnet';

/** Shape of the persisted wallet authentication state. */
export interface WalletState {
  /** The Stellar public address (G...). */
  address: string;
  /** Which Stellar network the wallet is connected to. */
  network: StellarNetwork | '';
  /** Human-readable wallet provider name (e.g. "Freighter", "Lobstr"). */
  walletType: string;
  /** Whether a wallet is currently connected. */
  isConnected: boolean;
  /** The Stellar public key (same as address in Stellar). */
  publicKey: string;
}

/** Actions available on the wallet authentication store. */
export interface WalletActions {
  /** Persist wallet connection details in the store. */
  connectWalletStore: (
    address: string,
    network: StellarNetwork,
    walletType: string,
    publicKey: string
  ) => void;
  /** Clear all wallet data from the store. */
  disconnectWalletStore: () => void;
  /** Update only the connection status flag. */
  updateConnectionStatus: (isConnected: boolean) => void;
}

/** Combined store type (state + actions). */
export type WalletStore = WalletState & WalletActions;

/** Options for initialising the wallet kit. */
export interface WalletKitOptions {
  /** Which Stellar network to connect to. Defaults to `'testnet'`. */
  network?: StellarNetwork;
}

/** Options passed to `signTransaction`. */
export interface SignTransactionOptions {
  /** The XDR-encoded unsigned transaction envelope. */
  unsignedTransaction: string;
  /** The Stellar address that should sign. */
  address: string;
  /** Override the network for signing. Defaults to the kit's configured network. */
  network?: StellarNetwork;
}

/** Return value from the `useWallet` hook. */
export interface UseWalletReturn {
  /** Open the wallet auth modal and handle connection. */
  handleConnect: () => Promise<void>;
  /** Disconnect the currently connected wallet. */
  handleDisconnect: () => Promise<void>;
}

/** Props for the `<WalletInfo>` component. */
export interface WalletInfoProps {
  /** Whether to show extra details like public key. */
  showDetails?: boolean;
  /** Additional CSS class names. */
  className?: string;
  /** Optional callback fired after successfully linking a wallet. */
  onWalletLinked?: () => void;
  /**
   * Optional async function to link the wallet address to an external
   * user account. Receives the connected Stellar address.
   * If omitted, no linking step is performed.
   */
  onLinkWallet?: (address: string) => Promise<void>;
}

/** Props for the `<WalletConnectionPrompt>` dialog. */
export interface WalletConnectionPromptProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Callback to toggle the dialog open state. */
  onOpenChange: (open: boolean) => void;
  /**
   * Optional async function to link the wallet address to an external
   * user account. If omitted, only the connection step runs.
   */
  onLinkWallet?: (address: string) => Promise<void>;
}

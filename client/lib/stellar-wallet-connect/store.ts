/**
 * Stellar Wallet Connect - Zustand Store
 *
 * Persisted store that tracks the connected wallet state.
 * Uses localStorage under the `stellar-wallet-auth` key.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { WalletStore } from './types';

const useWalletStore = create<WalletStore>()(
  persist(
    (set) => ({
      // ---- state ----
      address: '',
      network: '',
      walletType: '',
      isConnected: false,
      publicKey: '',

      // ---- actions ----
      connectWalletStore: (address, network, walletType, publicKey) =>
        set({
          address,
          network,
          walletType,
          publicKey,
          isConnected: true,
        }),

      disconnectWalletStore: () =>
        set({
          address: '',
          network: '',
          walletType: '',
          publicKey: '',
          isConnected: false,
        }),

      updateConnectionStatus: (isConnected) => set({ isConnected }),
    }),
    {
      name: 'stellar-wallet-auth',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default useWalletStore;

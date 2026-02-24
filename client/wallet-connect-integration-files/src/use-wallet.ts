/**
 * Stellar Wallet Connect - useWallet React Hook
 *
 * Provides `handleConnect` and `handleDisconnect` functions that
 * integrate the StellarWalletsKit auth modal with the Zustand store.
 */

'use client';

import { useEffect } from 'react';
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit/sdk';
import { KitEventType } from '@creit-tech/stellar-wallets-kit/types';
import {
  initializeWalletKit,
  isWalletKitInitialized,
  getInitializationError,
} from './kit';
import useWalletStore from './store';
import type { StellarNetwork, UseWalletReturn } from './types';

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the error object represents a silent / user-cancelled
 * action that should not surface to the UI.
 */
const isSilentError = (error: unknown): boolean => {
  if (error === null || error === undefined) return true;
  if (typeof error === 'string') return false;
  if (error instanceof Error) return !error.message;
  if (typeof error !== 'object') return false;

  const obj = error as Record<string, unknown>;
  if (
    (typeof obj.message === 'string' && obj.message.length > 0) ||
    (typeof obj.error === 'string' && obj.error.length > 0)
  ) {
    return false;
  }

  try {
    const s = JSON.stringify(error);
    if (s === '{}' || s === '') return true;
  } catch {
    /* ignore */
  }

  return (
    Object.keys(obj).length === 0 &&
    Object.getOwnPropertyNames(obj).length <= 1
  );
};

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message) return obj.message;
    if (typeof obj.error === 'string' && obj.error) return obj.error;
  }
  return 'Failed to connect wallet. Please try again.';
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that manages Stellar wallet connection lifecycle.
 *
 * @param network - Override the default network (`'testnet'`).
 */
export function useWallet(network?: StellarNetwork): UseWalletReturn {
  const { connectWalletStore, disconnectWalletStore, updateConnectionStatus } =
    useWalletStore();

  // Initialise kit and subscribe to events on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    initializeWalletKit(network);

    const unsubscribeState = StellarWalletsKit.on(
      KitEventType.STATE_UPDATED,
      (event) => {
        const { address, networkPassphrase } = event.payload;

        if (address) {
          const net: StellarNetwork = networkPassphrase.includes('TESTNET')
            ? 'testnet'
            : 'mainnet';
          connectWalletStore(address, net, 'Connected Wallet', address);
          updateConnectionStatus(true);
        } else {
          disconnectWalletStore();
          updateConnectionStatus(false);
        }
      }
    );

    const unsubscribeDisconnect = StellarWalletsKit.on(
      KitEventType.DISCONNECT,
      () => {
        disconnectWalletStore();
        updateConnectionStatus(false);
      }
    );

    // Check for an existing session on mount.
    const checkExistingConnection = async () => {
      try {
        const { address } = await StellarWalletsKit.getAddress();
        if (address) {
          connectWalletStore(
            address,
            network ?? 'testnet',
            'Connected Wallet',
            address
          );
          updateConnectionStatus(true);
        }
      } catch {
        // No active connection -- that's fine.
      }
    };

    checkExistingConnection();

    return () => {
      unsubscribeState();
      unsubscribeDisconnect();
    };
  }, [connectWalletStore, disconnectWalletStore, updateConnectionStatus, network]);

  // ------ connect ------
  const handleConnect = async () => {
    if (typeof window === 'undefined') {
      throw new Error('Wallet connection can only be used on the client side');
    }

    try {
      try {
        initializeWalletKit(network);
      } catch (initError) {
        console.error('Failed to initialize wallet kit:', initError);
        throw new Error(
          'Failed to initialize wallet. Please refresh the page and try again.'
        );
      }

      if (!isWalletKitInitialized()) {
        const err = getInitializationError();
        throw new Error(
          err?.message ||
            'Wallet kit is not initialized. Please refresh the page and try again.'
        );
      }

      document.body.classList.add('stellar-wallets-kit-modal-open');

      try {
        await StellarWalletsKit.authModal();
      } finally {
        setTimeout(() => {
          document.body.classList.remove('stellar-wallets-kit-modal-open');
        }, 300);
      }
    } catch (error) {
      if (isSilentError(error)) {
        updateConnectionStatus(false);
        return;
      }
      const msg = extractErrorMessage(error);
      updateConnectionStatus(false);
      throw new Error(msg);
    }
  };

  // ------ disconnect ------
  const handleDisconnect = async () => {
    if (typeof window === 'undefined') return;

    try {
      await StellarWalletsKit.disconnect();
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      throw error;
    }
  };

  return { handleConnect, handleDisconnect };
}

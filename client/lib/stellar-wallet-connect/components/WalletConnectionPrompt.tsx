/**
 * Stellar Wallet Connect - WalletConnectionPrompt Component
 *
 * A lightweight dialog/modal that prompts the user to connect (and
 * optionally link) their Stellar wallet. Renders a native `<dialog>`
 * element so it works without any UI library.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Wallet } from 'lucide-react';
import useWalletStore from '../store';
import { useWallet } from '../use-wallet';
import type { WalletConnectionPromptProps } from '../types';

export function WalletConnectionPrompt({
  open,
  onOpenChange,
  onLinkWallet,
}: WalletConnectionPromptProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { handleConnect } = useWallet();
  const { address, isConnected } = useWalletStore();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  // Sync `open` prop with native `<dialog>`.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Close when backdrop is clicked.
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onOpenChange(false);
    }
  };

  // Close if already connected.
  useEffect(() => {
    if (open && isConnected && address) {
      onOpenChange(false);
    }
  }, [open, isConnected, address, onOpenChange]);

  const handleConnectAndLink = async () => {
    setIsConnecting(true);
    try {
      await handleConnect();
      await new Promise((r) => setTimeout(r, 500));

      const connectedAddress = useWalletStore.getState().address;
      if (!connectedAddress) {
        throw new Error('Failed to get wallet address. Please try again.');
      }

      if (onLinkWallet) {
        setIsLinking(true);
        await onLinkWallet(connectedAddress);
      }

      onOpenChange(false);
    } catch (error) {
      let message = 'Failed to connect wallet';
      if (error instanceof Error) message = error.message || message;
      else if (typeof error === 'string') message = error;
      console.error('[stellar-wallet-connect] Prompt error:', message);
    } finally {
      setIsConnecting(false);
      setIsLinking(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="swc-dialog"
      onClick={handleBackdropClick}
      onClose={() => onOpenChange(false)}
      aria-labelledby="swc-prompt-title"
    >
      <div className="swc-dialog__content">
        <div className="swc-dialog__icon-wrapper">
          <Wallet className="swc-dialog__icon" aria-hidden="true" />
        </div>

        <h2 id="swc-prompt-title" className="swc-dialog__title">
          Connect Your Stellar Wallet
        </h2>

        <p className="swc-dialog__description">
          Link your Stellar wallet to start transacting on the Stellar network.
          You can connect or change your wallet at any time.
        </p>

        <div className="swc-dialog__actions">
          <button
            type="button"
            className="swc-btn swc-btn--primary"
            onClick={handleConnectAndLink}
            disabled={isConnecting || isLinking}
          >
            {isConnecting
              ? 'Connecting...'
              : isLinking
                ? 'Linking Wallet...'
                : 'Connect Wallet'}
          </button>
          <button
            type="button"
            className="swc-btn swc-btn--ghost"
            onClick={() => onOpenChange(false)}
            disabled={isConnecting || isLinking}
          >
            Skip for now
          </button>
        </div>
      </div>
    </dialog>
  );
}

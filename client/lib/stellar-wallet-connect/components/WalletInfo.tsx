/**
 * Stellar Wallet Connect - WalletInfo Component
 *
 * Displays connection status, address, network badge, and copy / explorer
 * actions. Designed to be dropped into any React project with minimal
 * dependencies (only `lucide-react` for icons).
 *
 * This component is **framework-agnostic** aside from requiring React 18+.
 * It does NOT depend on shadcn/ui -- it renders plain HTML with Tailwind
 * utility classes so consumers can restyle easily.
 */

'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Copy, ExternalLink, Wallet, XCircle } from 'lucide-react';
import useWalletStore from '../store';
import { useWallet } from '../use-wallet';
import type { WalletInfoProps, StellarNetwork } from '../types';

export function WalletInfo({
  showDetails = true,
  className = '',
  onWalletLinked,
  onLinkWallet,
}: WalletInfoProps) {
  const { address, network, walletType, isConnected, publicKey } =
    useWalletStore();
  const { handleConnect } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopyFeedback(true);
    }
  };

  useEffect(() => {
    if (copyFeedback) {
      const t = setTimeout(() => setCopyFeedback(false), 2000);
      return () => clearTimeout(t);
    }
  }, [copyFeedback]);

  const openExplorer = () => {
    if (!address) return;
    const url =
      network === 'testnet'
        ? `https://laboratory.stellar.org/#explorer?resource=account&values=${address}`
        : `https://stellar.expert/explorer/public/account/${address}`;
    window.open(url, '_blank', 'noopener');
  };

  const handleConnectAndLink = async () => {
    setIsConnecting(true);
    try {
      await handleConnect();

      // Give the store time to settle after the modal closes
      await new Promise((r) => setTimeout(r, 500));

      const connectedAddress = useWalletStore.getState().address;
      if (!connectedAddress) throw new Error('Failed to get wallet address');

      if (onLinkWallet) {
        setIsLinking(true);
        await onLinkWallet(connectedAddress);
      }

      onWalletLinked?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to connect wallet';
      console.error('[stellar-wallet-connect] WalletInfo error:', message);
    } finally {
      setIsConnecting(false);
      setIsLinking(false);
    }
  };

  const handleDisconnect = () => {
    useWalletStore.getState().disconnectWalletStore();
  };

  // ---- Not connected state ----
  if (!address || !isConnected) {
    return (
      <div
        className={`swc-card swc-card--disconnected ${className}`}
        role="status"
        aria-label="Wallet not connected"
      >
        <div className="swc-card__header">
          <Wallet className="swc-icon swc-icon--accent" aria-hidden="true" />
          <h3 className="swc-card__title">Wallet Status</h3>
        </div>
        <p className="swc-card__description">
          Connect your Stellar wallet to get started.
        </p>
        <div className="swc-card__body">
          <div className="swc-status swc-status--disconnected">
            <XCircle className="swc-status__icon" aria-hidden="true" />
            <span className="swc-status__label">Not Connected</span>
          </div>
          <button
            type="button"
            className="swc-btn swc-btn--primary"
            onClick={handleConnectAndLink}
            disabled={isConnecting || isLinking}
          >
            {isConnecting
              ? 'Connecting...'
              : isLinking
                ? 'Linking...'
                : 'Connect Wallet'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Connected state ----
  return (
    <div
      className={`swc-card swc-card--connected ${className}`}
      role="status"
      aria-label="Wallet connected"
    >
      <div className="swc-card__header">
        <Wallet className="swc-icon swc-icon--accent" aria-hidden="true" />
        <h3 className="swc-card__title">Wallet Information</h3>
      </div>
      <p className="swc-card__description">
        Your connected Stellar wallet details.
      </p>

      <div className="swc-card__body">
        {/* Connection Status */}
        <div className="swc-row">
          <span className="swc-row__label">Status</span>
          <div className="swc-status swc-status--connected">
            <CheckCircle className="swc-status__icon" aria-hidden="true" />
            <span className="swc-status__label">Connected</span>
          </div>
        </div>

        {/* Wallet Type */}
        <div className="swc-row">
          <span className="swc-row__label">Wallet</span>
          <span className="swc-badge">{walletType}</span>
        </div>

        {/* Network */}
        <div className="swc-row">
          <span className="swc-row__label">Network</span>
          <span
            className={`swc-badge ${network === 'testnet' ? 'swc-badge--warn' : 'swc-badge--success'}`}
          >
            {(network as StellarNetwork).toUpperCase()}
          </span>
        </div>

        {/* Address */}
        <div className="swc-address">
          <span className="swc-row__label">Public Address</span>
          <div className="swc-address__box">
            <code className="swc-address__value">{address}</code>
            <div className="swc-address__actions">
              <button
                type="button"
                className="swc-btn-icon"
                onClick={copyAddress}
                aria-label="Copy address"
              >
                <Copy className="swc-icon--sm" />
              </button>
              <button
                type="button"
                className="swc-btn-icon"
                onClick={openExplorer}
                aria-label="Open in Stellar Explorer"
              >
                <ExternalLink className="swc-icon--sm" />
              </button>
            </div>
          </div>
          {copyFeedback && (
            <span className="swc-feedback" role="status">
              Copied!
            </span>
          )}
        </div>

        {/* Public Key (optional) */}
        {showDetails && (
          <div className="swc-address">
            <span className="swc-row__label">Public Key</span>
            <div className="swc-address__box">
              <code className="swc-address__value">{publicKey}</code>
            </div>
            <p className="swc-hint">
              In Stellar, the public key is the same as the account address.
            </p>
          </div>
        )}

        {/* Disconnect */}
        <div className="swc-card__footer">
          <button
            type="button"
            className="swc-btn swc-btn--outline"
            onClick={handleDisconnect}
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

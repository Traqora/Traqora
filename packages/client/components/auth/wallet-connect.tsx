import React from 'react';
import { ShieldAlert, Lock, AlertTriangle } from 'lucide-react';

export interface WalletConnectProps {
  onConnect?: (walletType: string) => void;
  isLoading?: boolean;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({ onConnect, isLoading }) => {
  return (
    <div className="p-6 max-w-md mx-auto bg-card rounded-xl shadow-md border border-border space-y-4">
      <div className="flex items-center space-x-2 text-primary">
        <ShieldAlert className="w-6 h-6 text-amber-500" />
        <h2 className="text-xl font-bold">Connect Stellar Wallet</h2>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300 space-y-1">
        <div className="flex items-center font-semibold space-x-1">
          <AlertTriangle className="w-4 h-4 inline-block shrink-0" />
          <span>Anti-Phishing Security Warning</span>
        </div>
        <p className="text-xs leading-relaxed">
          Traqora will never ask for your recovery phrase, secret key, or password. Ensure you are visiting the official domain and verify your browser extension before signing transactions.
        </p>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => onConnect?.('freighter')}
          disabled={isLoading}
          className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          <Lock className="w-4 h-4" />
          <span>{isLoading ? 'Connecting...' : 'Connect with Freighter'}</span>
        </button>
      </div>

      <div className="text-center text-xs text-muted-foreground pt-2 border-t border-border">
        Protected by Traqora Wallet Guard &bull; Always verify transaction XDR details
      </div>
    </div>
  );
};

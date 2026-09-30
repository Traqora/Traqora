import React from 'react';
import { ShieldAlert, Lock, AlertTriangle } from 'lucide-react';

export interface StellarWalletConnectProps {
  onSelectWallet?: (walletId: string) => void;
}

export const StellarWalletConnect: React.FC<StellarWalletConnectProps> = ({ onSelectWallet }) => {
  return (
    <div className="space-y-4 p-4 border rounded-lg bg-background">
      <div className="flex items-center space-x-2 text-foreground">
        <ShieldAlert className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold text-base">Secure Stellar Connection</h3>
      </div>

      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive-foreground space-y-1">
        <div className="font-bold flex items-center space-x-1 text-destructive">
          <AlertTriangle className="w-4 h-4" />
          <span>Beware of Phishing Scams</span>
        </div>
        <p>
          Never type your 24-word recovery phrase or secret key into any website prompt or popup. Legitimate apps only request cryptographic transaction signatures.
        </p>
      </div>

      <div className="grid gap-2">
        <button
          onClick={() => onSelectWallet?.('freighter')}
          className="flex items-center justify-between p-3 border rounded-md hover:bg-accent transition font-medium"
        >
          <span>Freighter Wallet</span>
          <Lock className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => onSelectWallet?.('albedo')}
          className="flex items-center justify-between p-3 border rounded-md hover:bg-accent transition font-medium"
        >
          <span>Albedo</span>
          <Lock className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Verified Traqora integration. Always check extension URL and permissions.
      </p>
    </div>
  );
};

// Wallet integration utilities for Stellar/Freighter wallet
import { toast } from 'sonner';

export interface WalletConnection {
  publicKey: string;
  isConnected: boolean;
  walletType: 'freighter' | 'albedo' | null;
}

export interface FreighterAPI {
  isConnected: () => Promise<boolean>;
  getPublicKey: () => Promise<string>;
  signTransaction: (xdr: string, options?: { networkPassphrase?: string }) => Promise<string>;
  getNetwork: () => Promise<string>;
}

declare global {
  interface Window {
    freighter?: FreighterAPI;
  }
}

export const isFreighterInstalled = (): boolean => {
  return typeof window !== 'undefined' && !!window.freighter;
};

export const connectFreighterWallet = async (): Promise<WalletConnection | null> => {
  if (!isFreighterInstalled()) {
    toast.error('Freighter wallet not found', {
      description: 'Please install the Freighter browser extension',
      action: {
        label: 'Install',
        onClick: () => window.open('https://www.freighter.app/', '_blank'),
      },
    });
    return null;
  }

  try {
    const isConnected = await window.freighter!.isConnected();
    
    if (!isConnected) {
      toast.error('Wallet not connected', {
        description: 'Please connect your Freighter wallet',
      });
      return null;
    }

    const publicKey = await window.freighter!.getPublicKey();
    
    toast.success('Wallet connected successfully', {
      description: `Connected to ${publicKey.slice(0, 8)}...${publicKey.slice(-4)}`,
    });

    return {
      publicKey,
      isConnected: true,
      walletType: 'freighter',
    };
  } catch (error: any) {
    console.error('Error connecting to Freighter:', error);
    toast.error('Failed to connect wallet', {
      description: error.message || 'Please try again',
    });
    return null;
  }
};

export const signTransactionWithFreighter = async (
  xdr: string,
  networkPassphrase: string
): Promise<string | null> => {
  if (!isFreighterInstalled()) {
    toast.error('Freighter wallet not found');
    return null;
  }

  try {
    const signedXdr = await window.freighter!.signTransaction(xdr, {
      networkPassphrase,
    });
    
    return signedXdr;
  } catch (error: any) {
    console.error('Error signing transaction:', error);
    
    if (error.message?.includes('User declined')) {
      toast.error('Transaction rejected', {
        description: 'You declined the transaction in your wallet',
      });
    } else {
      toast.error('Failed to sign transaction', {
        description: error.message || 'Please try again',
      });
    }
    
    return null;
  }
};

export const disconnectWallet = (): void => {
  toast.info('Wallet disconnected');
};

export const getStellarExpertUrl = (txHash: string, network: 'testnet' | 'mainnet' = 'testnet'): string => {
  const baseUrl = network === 'mainnet' 
    ? 'https://stellar.expert/explorer/public'
    : 'https://stellar.expert/explorer/testnet';
  return `${baseUrl}/tx/${txHash}`;
};

export const getHorizonUrl = (network: 'testnet' | 'mainnet' = 'testnet'): string => {
  return network === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
};

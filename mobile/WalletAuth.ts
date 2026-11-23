import { WalletAuthFactory } from '../packages/backend/src/services/WalletSignatureAdapter';

export interface MobileWalletAuthRequest {
  walletAddress: string;
  signatureOrXdr: string;
  walletType: string;
  message?: string;
  networkPassphrase?: string;
}

export interface WalletNetworkValidationResult {
  isValid: boolean;
  error?: string;
  recoveryAction?: string;
}

export function validateWalletNetwork(connectedPassphrase?: string, expectedPassphrase?: string): WalletNetworkValidationResult {
  const expected = expectedPassphrase || 'Test SDF Network ; September 2015';
  if (connectedPassphrase && connectedPassphrase !== expected) {
    return {
      isValid: false,
      error: 'Wallet is connected to the wrong Stellar network.',
      recoveryAction: 'Please switch your wallet network to match the expected environment (Testnet / Mainnet) and try again.',
    };
  }
  return { isValid: true };
}

export async function authenticateMobileWallet({
  walletAddress,
  signatureOrXdr,
  walletType,
  message = '',
  networkPassphrase,
}: MobileWalletAuthRequest): Promise<boolean> {
  try {
    if (!walletAddress || !signatureOrXdr || !walletType) {
      throw new Error('Missing required authentication parameters');
    }
    const networkCheck = validateWalletNetwork(networkPassphrase);
    if (!networkCheck.isValid) {
      throw new Error(`${networkCheck.error} Recovery: ${networkCheck.recoveryAction}`);
    }
    const adapter = WalletAuthFactory.getAdapter(walletType);
    const isValid = await adapter.verify(signatureOrXdr, walletAddress, message, networkPassphrase);
    return isValid;
  } catch (error: any) {
    console.error('Mobile wallet signature authentication error:', error?.message || error);
    throw new Error(error?.message || 'Wallet signature authentication failed');
  }
}

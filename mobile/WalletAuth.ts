import { WalletAuthFactory } from '../packages/backend/src/services/WalletSignatureAdapter';

export interface MobileWalletAuthRequest {
  walletAddress: string;
  signatureOrXdr: string;
  walletType: string;
  message?: string;
  networkPassphrase?: string;
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
    const adapter = WalletAuthFactory.getAdapter(walletType);
    const isValid = await adapter.verify(signatureOrXdr, walletAddress, message, networkPassphrase);
    return isValid;
  } catch (error: any) {
    console.error('Mobile wallet signature authentication error:', error?.message || error);
    throw new Error(error?.message || 'Wallet signature authentication failed');
  }
}

import { authenticateMobileWallet, MobileWalletAuthRequest } from '../WalletAuth';

export interface QuotePaymentRequest extends Omit<MobileWalletAuthRequest, 'message'> {
  quoteId: string;
  exactAsset: string;
  exactAmount: string;
}

export async function requestQuoteWalletAuthorization(req: QuotePaymentRequest): Promise<boolean> {
  if (!req.quoteId || !req.exactAsset || !req.exactAmount) {
    throw new Error('Missing exact quote parameters for wallet authorization');
  }
  const message = `Authorize payment for quote ${req.quoteId}: ${req.exactAmount} ${req.exactAsset}`;
  return await authenticateMobileWallet({
    walletAddress: req.walletAddress,
    signatureOrXdr: req.signatureOrXdr,
    walletType: req.walletType,
    message,
    networkPassphrase: req.networkPassphrase,
  });
}

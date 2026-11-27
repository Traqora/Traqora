import { requestQuoteWalletAuthorization } from '../../booking/QuotePaymentAuth';
import { authenticateMobileWallet } from '../../WalletAuth';

jest.mock('../../WalletAuth', () => ({
  authenticateMobileWallet: jest.fn(),
}));

describe('Quote Payment Wallet Authorization', () => {
  it('requests wallet authorization with the exact quote asset and amount', async () => {
    (authenticateMobileWallet as jest.Mock).mockResolvedValue(true);

    const result = await requestQuoteWalletAuthorization({
      walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
      signatureOrXdr: 'mock_sig',
      walletType: 'albedo',
      quoteId: 'quote_123',
      exactAsset: 'XLM',
      exactAmount: '150.00',
    });

    expect(result).toBe(true);
    expect(authenticateMobileWallet).toHaveBeenCalledWith({
      walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
      signatureOrXdr: 'mock_sig',
      walletType: 'albedo',
      message: 'Authorize payment for quote quote_123: 150.00 XLM',
      networkPassphrase: undefined,
    });
  });

  it('throws an error if quote details are missing', async () => {
    await expect(
      requestQuoteWalletAuthorization({
        walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
        signatureOrXdr: 'mock_sig',
        walletType: 'albedo',
        quoteId: '',
        exactAsset: '',
        exactAmount: '',
      })
    ).rejects.toThrow('Missing exact quote parameters for wallet authorization');
  });
});

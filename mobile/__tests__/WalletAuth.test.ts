import { authenticateMobileWallet } from '../WalletAuth';
import { WalletAuthFactory } from '../../packages/backend/src/services/WalletSignatureAdapter';

jest.mock('../../packages/backend/src/services/WalletSignatureAdapter', () => {
  return {
    WalletAuthFactory: {
      getAdapter: jest.fn(),
    },
  };
});

describe('Mobile Wallet Authentication', () => {
  it('successfully verifies a valid wallet signature', async () => {
    const mockVerify = jest.fn().mockResolvedValue(true);
    (WalletAuthFactory.getAdapter as jest.Mock).mockReturnValue({ verify: mockVerify });

    const result = await authenticateMobileWallet({
      walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
      signatureOrXdr: 'mock_signature',
      walletType: 'albedo',
      message: 'test_challenge',
    });

    expect(result).toBe(true);
    expect(mockVerify).toHaveBeenCalledWith('mock_signature', 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB', 'test_challenge', undefined);
  });

  it('throws an error on missing required parameters', async () => {
    await expect(
      authenticateMobileWallet({
        walletAddress: '',
        signatureOrXdr: '',
        walletType: '',
      })
    ).rejects.toThrow('Missing required authentication parameters');
  });

  it('handles adapter verification failure gracefully', async () => {
    const mockVerify = jest.fn().mockResolvedValue(false);
    (WalletAuthFactory.getAdapter as jest.Mock).mockReturnValue({ verify: mockVerify });

    const result = await authenticateMobileWallet({
      walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
      signatureOrXdr: 'invalid_signature',
      walletType: 'freighter',
    });

    expect(result).toBe(false);
  });
});

import { authenticateMobileWallet } from '../WalletAuth';
import { WalletAuthFactory } from '../../packages/backend/src/services/WalletSignatureAdapter';

jest.mock('../../packages/backend/src/services/WalletSignatureAdapter', () => {
  return {
    WalletAuthFactory: {
      getAdapter: jest.fn(),
    },
  };
});

import { validateWalletNetwork } from '../WalletAuth';

describe('Mobile Wallet Network Validation', () => {
  it('succeeds when network passphrase matches expected', () => {
    const res = validateWalletNetwork('Test SDF Network ; September 2015', 'Test SDF Network ; September 2015');
    expect(res.isValid).toBe(true);
  });

  it('fails with clear recovery action when network passphrase mismatches', () => {
    const res = validateWalletNetwork('Public Global Stellar Network ; September 2015', 'Test SDF Network ; September 2015');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('wrong Stellar network');
    expect(res.recoveryAction).toBeDefined();
  });
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

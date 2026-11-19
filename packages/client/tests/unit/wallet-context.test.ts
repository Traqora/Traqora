import { walletContextMatches } from '@/lib/wallet-context';

describe('walletContextMatches', () => {
  it('allows submission when account and network are unchanged', () => {
    expect(walletContextMatches({
      expectedAddress: 'GABC', expectedNetwork: 'testnet', isConnected: true,
      activeAddress: 'GABC', activeNetwork: 'testnet',
    })).toBe(true);
  });

  it.each([
    ['account changed', { activeAddress: 'GDEF', activeNetwork: 'testnet' }],
    ['network changed', { activeAddress: 'GABC', activeNetwork: 'mainnet' }],
    ['wallet disconnected', { activeAddress: 'GABC', activeNetwork: 'testnet', isConnected: false }],
  ])('blocks submission when %s', (_label, override) => {
    expect(walletContextMatches({
      expectedAddress: 'GABC', expectedNetwork: 'testnet', isConnected: true,
      activeAddress: 'GABC', activeNetwork: 'testnet',
      ...override,
    })).toBe(false);
  });
});

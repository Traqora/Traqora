import type { StellarNetwork } from './stellar-wallet-connect/types';

export function walletContextMatches(input: {
  expectedAddress: string;
  expectedNetwork: StellarNetwork;
  isConnected: boolean;
  activeAddress: string;
  activeNetwork: StellarNetwork | '';
}): boolean {
  return input.isConnected &&
    input.activeAddress === input.expectedAddress &&
    input.activeNetwork === input.expectedNetwork;
}

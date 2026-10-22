import { Networks } from '@stellar/stellar-sdk';
import {
  assertValidStellarConfiguration,
  canonicalNetwork,
  expectedPassphrase,
  hasConfiguredContracts,
  STELLAR_NETWORKS,
  StellarConfigurationError,
  validateStellarConfiguration,
} from './stellarNetwork';

const CONTRACT_IDS = {
  booking: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  airline: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4',
};

describe('stellarNetwork config validation (#925/#926)', () => {
  it('maps production to mainnet and derives the standard passphrases', () => {
    expect(canonicalNetwork('production')).toBe('mainnet');
    expect(expectedPassphrase('production')).toBe(Networks.PUBLIC);
    expect(expectedPassphrase('mainnet')).toBe(Networks.PUBLIC);
    expect(expectedPassphrase('testnet')).toBe(Networks.TESTNET);
    expect(expectedPassphrase('standalone')).toBe(Networks.STANDALONE);
  });

  it('accepts a consistent testnet configuration with bound contracts', () => {
    expect(
      validateStellarConfiguration({
        stellarNetwork: 'testnet',
        stellarNetworkPassphrase: Networks.TESTNET,
        horizonUrl: STELLAR_NETWORKS.testnet.horizonUrl,
        sorobanRpcUrl: STELLAR_NETWORKS.testnet.sorobanRpcUrl,
        contractsNetwork: 'testnet',
        contractIds: CONTRACT_IDS,
        requireContractsNetwork: true,
      }),
    ).toEqual([]);
  });

  it('accepts a consistent production configuration', () => {
    expect(
      validateStellarConfiguration({
        stellarNetwork: 'production',
        stellarNetworkPassphrase: Networks.PUBLIC,
        horizonUrl: STELLAR_NETWORKS.mainnet.horizonUrl,
        sorobanRpcUrl: STELLAR_NETWORKS.mainnet.sorobanRpcUrl,
        contractsNetwork: 'mainnet',
        contractIds: CONTRACT_IDS,
        requireContractsNetwork: true,
      }),
    ).toEqual([]);
  });

  it('rejects a mainnet passphrase on testnet', () => {
    const issues = validateStellarConfiguration({
      stellarNetwork: 'testnet',
      stellarNetworkPassphrase: Networks.PUBLIC,
      horizonUrl: STELLAR_NETWORKS.testnet.horizonUrl,
      sorobanRpcUrl: STELLAR_NETWORKS.testnet.sorobanRpcUrl,
    });
    expect(issues.map((issue) => issue.code)).toContain('PASSPHRASE_MISMATCH');
  });

  it('rejects a testnet contract binding on mainnet', () => {
    const issues = validateStellarConfiguration({
      stellarNetwork: 'mainnet',
      horizonUrl: STELLAR_NETWORKS.mainnet.horizonUrl,
      sorobanRpcUrl: STELLAR_NETWORKS.mainnet.sorobanRpcUrl,
      contractsNetwork: 'testnet',
      contractIds: CONTRACT_IDS,
      requireContractsNetwork: true,
    });
    expect(issues.map((issue) => issue.code)).toContain('CONTRACTS_NETWORK_MISMATCH');
  });

  it('rejects mismatched Horizon and Soroban RPC endpoints', () => {
    const issues = validateStellarConfiguration({
      stellarNetwork: 'mainnet',
      horizonUrl: STELLAR_NETWORKS.testnet.horizonUrl,
      sorobanRpcUrl: STELLAR_NETWORKS.testnet.sorobanRpcUrl,
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['HORIZON_NETWORK_MISMATCH', 'SOROBAN_RPC_NETWORK_MISMATCH']),
    );
  });

  it('requires a contract network binding in production when IDs are configured', () => {
    const issues = validateStellarConfiguration({
      stellarNetwork: 'mainnet',
      horizonUrl: STELLAR_NETWORKS.mainnet.horizonUrl,
      sorobanRpcUrl: STELLAR_NETWORKS.mainnet.sorobanRpcUrl,
      contractIds: CONTRACT_IDS,
      requireContractsNetwork: true,
    });
    expect(issues.map((issue) => issue.code)).toContain('CONTRACTS_NETWORK_MISSING');
  });

  it('does not require a binding when only placeholders are configured', () => {
    expect(hasConfiguredContracts({ booking: 'DEFAULT_ID', airline: undefined })).toBe(false);
    expect(
      validateStellarConfiguration({
        stellarNetwork: 'mainnet',
        horizonUrl: STELLAR_NETWORKS.mainnet.horizonUrl,
        sorobanRpcUrl: STELLAR_NETWORKS.mainnet.sorobanRpcUrl,
        contractIds: { booking: 'DEFAULT_ID' },
        requireContractsNetwork: true,
      }),
    ).toEqual([]);
  });

  it('throws a StellarConfigurationError carrying every issue', () => {
    expect(() =>
      assertValidStellarConfiguration({
        stellarNetwork: 'testnet',
        horizonUrl: STELLAR_NETWORKS.mainnet.horizonUrl,
        sorobanRpcUrl: STELLAR_NETWORKS.mainnet.sorobanRpcUrl,
        contractsNetwork: 'mainnet',
        contractIds: CONTRACT_IDS,
        requireContractsNetwork: true,
      }),
    ).toThrow(StellarConfigurationError);
  });
});

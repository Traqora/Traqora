import { Networks, StrKey } from '@stellar/stellar-sdk';
import {
  assertValidStellarConfiguration,
  canonicalNetwork,
  expectedPassphrase,
  hasConfiguredContracts,
  STELLAR_NETWORKS,
  StellarConfigurationError,
  validateStellarConfiguration,
} from './stellarNetwork';

const contractId = (fill: number) =>
  StrKey.encodeContract(new Uint8Array(32).fill(fill));

const CONTRACT_IDS = {
  booking: contractId(1),
  airline: contractId(2),
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

describe('contract ID validation (#935)', () => {
  const base = {
    stellarNetwork: 'testnet' as const,
    horizonUrl: STELLAR_NETWORKS.testnet.horizonUrl,
    sorobanRpcUrl: STELLAR_NETWORKS.testnet.sorobanRpcUrl,
    contractsNetwork: 'testnet' as const,
    requireContractsNetwork: true,
  };

  it('rejects a configured contract ID that is not a valid StrKey in any environment', () => {
    const issues = validateStellarConfiguration({
      ...base,
      contractIds: { ...CONTRACT_IDS, token: 'NOT_A_CONTRACT' },
      requireContractIds: false,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CONTRACT_ID_INVALID',
          message: expect.stringContaining('TOKEN_CONTRACT_ID'),
        }),
      ]),
    );
    expect(issues.map((issue) => issue.message).join(' ')).not.toContain('NOT_A_CONTRACT');
  });

  it('names every missing contract entry when a complete contract set is required', () => {
    const issues = validateStellarConfiguration({
      ...base,
      contractIds: { booking: CONTRACT_IDS.booking },
      requireContractIds: true,
    });

    const missing = issues
      .filter((issue) => issue.code === 'CONTRACT_ID_MISSING')
      .map((issue) => issue.message);

    expect(missing).toEqual(
      expect.arrayContaining([
        expect.stringContaining('AIRLINE_CONTRACT_ID'),
        expect.stringContaining('REFUND_CONTRACT_ID'),
        expect.stringContaining('LOYALTY_CONTRACT_ID'),
        expect.stringContaining('GOVERNANCE_CONTRACT_ID'),
        expect.stringContaining('TOKEN_CONTRACT_ID'),
        expect.stringContaining('FLIGHT_REGISTRY_CONTRACT_ID'),
      ]),
    );
    expect(missing.join(' ')).not.toContain('BOOKING_CONTRACT_ID');
  });

  it('treats DEFAULT_ID as missing only when contract IDs are required', () => {
    expect(
      validateStellarConfiguration({
        ...base,
        contractIds: { booking: 'DEFAULT_ID' },
        requireContractIds: false,
      }),
    ).toEqual([]);

    expect(
      validateStellarConfiguration({
        ...base,
        contractIds: { booking: 'DEFAULT_ID' },
        requireContractIds: true,
      }).some((issue) => issue.code === 'CONTRACT_ID_MISSING'),
    ).toBe(true);
  });

  it('accepts a complete, valid contract set', () => {
    expect(
      validateStellarConfiguration({
        ...base,
        contractIds: {
          booking: CONTRACT_IDS.booking,
          airline: CONTRACT_IDS.airline,
          refund: CONTRACT_IDS.booking,
          loyalty: CONTRACT_IDS.airline,
          governance: CONTRACT_IDS.booking,
          token: CONTRACT_IDS.airline,
          flightRegistry: CONTRACT_IDS.booking,
        },
        requireContractIds: true,
      }),
    ).toEqual([]);
  });
});

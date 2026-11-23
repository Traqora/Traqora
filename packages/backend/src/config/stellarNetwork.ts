/**
 * Stellar network consistency validation (#925) and contract-to-network
 * binding (#926).
 *
 * A Stellar contract ID is a network-agnostic StrKey: the address itself does
 * not encode whether it was deployed to testnet or mainnet. The only reliable
 * way to prevent a testnet contract ID from being used against mainnet (or the
 * reverse) is to record the network the contracts were deployed to and compare
 * it with the network the backend is configured to use.
 *
 * This module is deliberately pure: it has no I/O and no dependency on the
 * loaded config singleton, so it can be exercised by both startup validation
 * and unit tests.
 */

import { Networks, StrKey } from '@stellar/stellar-sdk';

export type StellarNetwork = 'production' | 'mainnet' | 'testnet' | 'standalone';
export type CanonicalStellarNetwork = 'mainnet' | 'testnet' | 'standalone';

export interface StellarNetworkDefinition {
  canonical: CanonicalStellarNetwork;
  passphrase: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
}

export const STELLAR_NETWORKS: Record<CanonicalStellarNetwork, StellarNetworkDefinition> = {
  testnet: {
    canonical: 'testnet',
    passphrase: Networks.TESTNET,
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  },
  mainnet: {
    canonical: 'mainnet',
    passphrase: Networks.PUBLIC,
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban-rpc.stellar.org',
  },
  standalone: {
    canonical: 'standalone',
    passphrase: Networks.STANDALONE,
    horizonUrl: 'http://localhost:8000',
    sorobanRpcUrl: 'http://localhost:8000/soroban/rpc',
  },
};

export type StellarConfigIssueCode =
  | 'PASSPHRASE_MISMATCH'
  | 'HORIZON_NETWORK_MISMATCH'
  | 'SOROBAN_RPC_NETWORK_MISMATCH'
  | 'CONTRACTS_NETWORK_MISMATCH'
  | 'CONTRACTS_NETWORK_MISSING'
  | 'CONTRACT_ID_MISSING'
  | 'CONTRACT_ID_INVALID';

/**
 * Environment variable that supplies each configured Soroban contract ID.
 * Used only to name the offending entry in startup errors (#935); values are
 * never echoed back because they can include operator-specific configuration.
 */
export const CONTRACT_ENV_NAMES: Record<string, string> = {
  booking: 'BOOKING_CONTRACT_ID',
  airline: 'AIRLINE_CONTRACT_ID',
  refund: 'REFUND_CONTRACT_ID',
  loyalty: 'LOYALTY_CONTRACT_ID',
  governance: 'GOVERNANCE_CONTRACT_ID',
  token: 'TOKEN_CONTRACT_ID',
  flightRegistry: 'FLIGHT_REGISTRY_CONTRACT_ID',
};

export interface StellarConfigIssue {
  code: StellarConfigIssueCode;
  message: string;
}

export class StellarConfigurationError extends Error {
  readonly issues: StellarConfigIssue[];

  constructor(issues: StellarConfigIssue[]) {
    super(
      `Invalid Stellar configuration: ${issues.map((issue) => issue.message).join(' ')}`,
    );
    this.name = 'StellarConfigurationError';
    this.issues = issues;
  }
}

export function canonicalNetwork(network: StellarNetwork): CanonicalStellarNetwork {
  return network === 'production' ? 'mainnet' : network;
}

export function expectedPassphrase(network: StellarNetwork): string {
  return STELLAR_NETWORKS[canonicalNetwork(network)].passphrase;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function looksLikeOtherNetwork(url: string, network: CanonicalStellarNetwork): boolean {
  const host = hostnameOf(url);
  if (!host) return false;

  const isLocal = LOCAL_HOSTS.has(host);
  if (network === 'mainnet') {
    return (
      isLocal ||
      host.includes('testnet') ||
      host.includes('futurenet') ||
      host === 'horizon-testnet.stellar.org' ||
      host === 'soroban-testnet.stellar.org'
    );
  }

  // testnet
  return (
    host.includes('mainnet') ||
    host === 'horizon.stellar.org' ||
    host === 'soroban-rpc.stellar.org'
  );
}

function placeholderContractId(value: string | undefined | null): boolean {
  return !value || value === 'DEFAULT_ID';
}

export function hasConfiguredContracts(contractIds: Record<string, string | undefined | null>): boolean {
  return Object.values(contractIds).some((id) => !placeholderContractId(id));
}

export interface StellarConfigurationInput {
  stellarNetwork: StellarNetwork;
  /** Explicit passphrase override from the environment, if any. */
  stellarNetworkPassphrase?: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  /** Network recorded alongside the configured contract IDs (#926). */
  contractsNetwork?: StellarNetwork;
  contractIds?: Record<string, string | undefined | null>;
  /**
   * When true, configured contract IDs without a CONTRACTS_NETWORK binding are
   * rejected. Production/staging startup sets this; development and tests may
   * leave it false for backwards compatibility.
   */
  requireContractsNetwork?: boolean;
  /**
   * When true, every known contract ID must be present and non-placeholder.
   * Production/staging startup sets this; local development may intentionally
   * run without deployed contracts. Configured (non-placeholder) IDs are
   * always validated for StrKey shape regardless of this flag (#935).
   */
  requireContractIds?: boolean;
}

export function validateStellarConfiguration(
  input: StellarConfigurationInput,
): StellarConfigIssue[] {
  const issues: StellarConfigIssue[] = [];
  const network = canonicalNetwork(input.stellarNetwork);
  const expected = STELLAR_NETWORKS[network];

  if (
    input.stellarNetworkPassphrase !== undefined &&
    input.stellarNetworkPassphrase !== '' &&
    input.stellarNetworkPassphrase !== expected.passphrase
  ) {
    issues.push({
      code: 'PASSPHRASE_MISMATCH',
      message: `STELLAR_NETWORK_PASSPHRASE does not match ${input.stellarNetwork} (expected "${expected.passphrase}").`,
    });
  }

  if (network !== 'standalone' && looksLikeOtherNetwork(input.horizonUrl, network)) {
    issues.push({
      code: 'HORIZON_NETWORK_MISMATCH',
      message: `HORIZON_URL "${input.horizonUrl}" does not belong to ${network}.`,
    });
  }

  if (network !== 'standalone' && looksLikeOtherNetwork(input.sorobanRpcUrl, network)) {
    issues.push({
      code: 'SOROBAN_RPC_NETWORK_MISMATCH',
      message: `SOROBAN_RPC_URL "${input.sorobanRpcUrl}" does not belong to ${network}.`,
    });
  }

  if (input.contractsNetwork !== undefined) {
    const contractsNetwork = canonicalNetwork(input.contractsNetwork);
    if (contractsNetwork !== network) {
      issues.push({
        code: 'CONTRACTS_NETWORK_MISMATCH',
        message: `CONTRACTS_NETWORK is ${input.contractsNetwork} but the backend is configured for ${input.stellarNetwork}. Contract IDs cannot cross networks.`,
      });
    }
  } else if (
    input.requireContractsNetwork &&
    input.contractIds &&
    hasConfiguredContracts(input.contractIds)
  ) {
    issues.push({
      code: 'CONTRACTS_NETWORK_MISSING',
      message:
        'CONTRACTS_NETWORK must be set when contract IDs are configured so the addresses are bound to a Stellar network.',
    });
  }

  // Validate every contract ID the operator supplied. A value that is present
  // but malformed can never be used to build a Soroban invocation, so it is a
  // startup error even in development. Missing/placeholder IDs are only an
  // error when the environment requires a complete contract set.
  const contractKeys = new Set([
    ...Object.keys(CONTRACT_ENV_NAMES),
    ...Object.keys(input.contractIds ?? {}),
  ]);

  for (const key of contractKeys) {
    const envName =
      CONTRACT_ENV_NAMES[key] ?? `${key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}_CONTRACT_ID`;
    const value = input.contractIds?.[key];

    if (placeholderContractId(value)) {
      if (input.requireContractIds) {
        issues.push({
          code: 'CONTRACT_ID_MISSING',
          message: `${envName} is required but is missing or still set to the DEFAULT_ID placeholder.`,
        });
      }
      continue;
    }

    if (!StrKey.isValidContract(value as string)) {
      issues.push({
        code: 'CONTRACT_ID_INVALID',
        message: `${envName} is not a valid Soroban contract ID. Expected a 56-character StrKey beginning with "C".`,
      });
    }
  }

  return issues;
}

export function assertValidStellarConfiguration(input: StellarConfigurationInput): void {
  const issues = validateStellarConfiguration(input);
  if (issues.length > 0) {
    throw new StellarConfigurationError(issues);
  }
}

/**
 * The network passphrase used to build and sign transactions. It is derived
 * from the validated `stellarNetwork` rather than accepted independently.
 */
export function networkPassphraseFor(network: StellarNetwork): string {
  return expectedPassphrase(network);
}

export type ProviderEnvironment = 'sandbox' | 'production';
export type CapabilityStatus = 'supported' | 'partial' | 'unsupported';

export type ProviderCapability = {
  status: CapabilityStatus;
  summary: string;
  dataNotes: string[];
  failureNotes: string[];
};

export type ProviderCapabilityMatrix = Record<string, ProviderCapability>;

/**
 * The capability contract for the providers currently wired into Traqora.
 * Sandbox is intentionally explicit: a passing search against fixtures or an
 * Amadeus test endpoint is not evidence that airline fulfilment is available.
 */
export const PROVIDER_CAPABILITIES: Record<ProviderEnvironment, ProviderCapabilityMatrix> = {
  sandbox: {
    search: {
      status: 'supported',
      summary: 'Repository fixtures are always available; Amadeus test search is optional.',
      dataNotes: ['Fixture prices and seat counts are deterministic.', 'Amadeus test offers may omit production-only carrier data.'],
      failureNotes: ['Provider timeouts are eligible for failover.', 'A missing Amadeus credential disables that provider rather than failing startup.'],
    },
    booking: {
      status: 'partial',
      summary: 'Booking can exercise the application and contract flow, but does not create an airline reservation.',
      dataNotes: ['Sandbox booking records use repository/contract test data.', 'Provider confirmation codes and ticket numbers are not authoritative.'],
      failureNotes: ['A successful sandbox transaction does not prove production airline fulfilment.', 'Contract/RPC failures should be retried only when classified transient.'],
    },
    ancillary: {
      status: 'partial',
      summary: 'Catalog, pricing, ownership, and persistence are available; airline fulfilment is not.',
      dataNotes: ['Catalog values are application-owned integer cents.', 'Availability is derived from the local catalog and booking state.'],
      failureNotes: ['Unsupported carrier-specific extras must remain visible as unsupported, not be silently treated as confirmed.'],
    },
    status_updates: {
      status: 'partial',
      summary: 'Fixture/provider polling can update application status; live operational accuracy is not guaranteed.',
      dataNotes: ['Gate, terminal, and cancellation details may be absent in test data.'],
      failureNotes: ['Consumers must tolerate missing optional status fields.'],
    },
  },
  production: {
    search: {
      status: 'supported',
      summary: 'Repository data is primary and configured provider failover may use live Amadeus offers.',
      dataNotes: ['Live offer prices and seats are time-sensitive.', 'Amadeus-mapped results have no rating and may not have local booking IDs.'],
      failureNotes: ['Provider failures are recorded per attempt and surfaced after the full failover chain is exhausted.'],
    },
    booking: {
      status: 'partial',
      summary: 'Traqora submits the configured Soroban booking transaction; airline ticketing remains outside this provider boundary.',
      dataNotes: ['On-chain confirmation is the source of truth for the Traqora booking record.'],
      failureNotes: ['Never use a sandbox confirmation as production proof.', 'Do not retry non-transient contract rejection errors.'],
    },
    ancillary: {
      status: 'partial',
      summary: 'Application-managed ancillary purchases and upgrades are supported; direct airline fulfilment is not wired here.',
      dataNotes: ['Production revenue reporting uses persisted purchase state.', 'Carrier inventory and post-ticket servicing are not represented by the catalog.'],
      failureNotes: ['Operations outside the local catalog must be rejected with an explicit unsupported response.'],
    },
    status_updates: {
      status: 'partial',
      summary: 'Configured flight sync/status providers can update operational fields.',
      dataNotes: ['Provider payloads may conflict; sync metadata records the source and conflict state.'],
      failureNotes: ['Stale or conflicting provider data must not be presented as a guaranteed live status.'],
    },
  },
};

export function getProviderCapabilities(environment: ProviderEnvironment): ProviderCapabilityMatrix {
  return PROVIDER_CAPABILITIES[environment];
}

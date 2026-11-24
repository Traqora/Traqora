/**
 * Stablecoin issuer allowlist (#919).
 *
 * Contract
 * --------
 * Inputs : asset `code` + `issuer` (Stellar classic asset) plus the configured
 *          allowlist. Native XLM is never treated as a stablecoin payment.
 * Outputs: `{ ok: true }` or `{ ok: false, reason }` with a stable code.
 * Error cases: missing code/issuer, code/issuer mismatch, unknown issuer.
 *
 * Call this before accepting a stablecoin payment or constructing escrow.
 */

export interface StablecoinAsset {
  code: string;
  issuer: string;
}

export interface AllowlistEntry extends StablecoinAsset {
  name?: string;
}

export const STABLECOIN_UNTRUSTED_REASONS = {
  MISSING_ASSET: "missing_asset",
  UNTRUSTED_ISSUER: "untrusted_issuer",
  CODE_ISSUER_MISMATCH: "code_issuer_mismatch",
} as const;

export type StablecoinAllowlistReason =
  (typeof STABLECOIN_UNTRUSTED_REASONS)[keyof typeof STABLECOIN_UNTRUSTED_REASONS];

export type StablecoinAllowlistResult =
  | { ok: true; asset: StablecoinAsset }
  | { ok: false; reason: StablecoinAllowlistReason; message: string };

const DEFAULT_ALLOWLIST: AllowlistEntry[] = [
  {
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    name: "centre.io USDC",
  },
  {
    code: "USDC",
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    name: "Circle testnet USDC",
  },
];

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

export function parseAllowlist(raw?: string | null): AllowlistEntry[] {
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_ALLOWLIST;
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [code, issuer] = entry.split(":");
      return { code: normalize(code || ""), issuer: (issuer || "").trim() };
    })
    .filter((entry) => entry.code && entry.issuer);
}

export function assertTrustedStablecoin(
  asset: Partial<StablecoinAsset> | null | undefined,
  allowlist: AllowlistEntry[] = DEFAULT_ALLOWLIST,
): StablecoinAllowlistResult {
  const code = asset?.code ? normalize(asset.code) : "";
  const issuer = asset?.issuer?.trim() || "";

  if (!code || !issuer) {
    return {
      ok: false,
      reason: STABLECOIN_UNTRUSTED_REASONS.MISSING_ASSET,
      message: "Stablecoin payments require both an asset code and issuer.",
    };
  }

  const match = allowlist.find(
    (entry) => normalize(entry.code) === code && entry.issuer === issuer,
  );
  if (match) {
    return { ok: true, asset: { code, issuer } };
  }

  const codeKnown = allowlist.some((entry) => normalize(entry.code) === code);
  if (codeKnown) {
    return {
      ok: false,
      reason: STABLECOIN_UNTRUSTED_REASONS.CODE_ISSUER_MISMATCH,
      message: `${code} from issuer ${issuer} is not on the Traqora allowlist.`,
    };
  }

  return {
    ok: false,
    reason: STABLECOIN_UNTRUSTED_REASONS.UNTRUSTED_ISSUER,
    message: `${code}:${issuer} is not an allowed stablecoin.`,
  };
}

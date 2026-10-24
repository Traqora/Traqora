import {
  assertTrustedStablecoin,
  parseAllowlist,
  STABLECOIN_UNTRUSTED_REASONS,
} from "./stablecoinIssuerAllowlist";

const USDC_TESTNET = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

describe("stablecoin issuer allowlist (#919)", () => {
  it("accepts an allowlisted code and issuer", () => {
    const result = assertTrustedStablecoin({ code: "usdc", issuer: USDC_TESTNET });
    expect(result).toEqual({ ok: true, asset: { code: "USDC", issuer: USDC_TESTNET } });
  });

  it("rejects a trusted code from an untrusted issuer", () => {
    const result = assertTrustedStablecoin({
      code: "USDC",
      issuer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(STABLECOIN_UNTRUSTED_REASONS.CODE_ISSUER_MISMATCH);
    }
  });

  it("rejects a missing issuer before escrow construction", () => {
    const result = assertTrustedStablecoin({ code: "USDC" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(STABLECOIN_UNTRUSTED_REASONS.MISSING_ASSET);
    }
  });

  it("parses env allowlist overrides", () => {
    const list = parseAllowlist("USDT:GTESTISSUER");
    const result = assertTrustedStablecoin({ code: "USDT", issuer: "GTESTISSUER" }, list);
    expect(result.ok).toBe(true);
  });
});

import {
  DEFAULT_MAX_AGE_SECONDS,
  NonceStore,
  SIGNATURE_HEADER,
  signWebhook,
  verifyWebhook,
} from "../../src/middleware/webhookVerification";

const SECRET = "test-webhook-signing-secret";

interface SignedPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  nonce: string;
}

function makePayload(
  overrides: Partial<SignedPayload> = {},
  now = Date.now()
): { body: string; payload: SignedPayload; headers: Record<string, string> } {
  const timestamp = new Date(now).toISOString();
  const nonce = overrides.nonce ?? "11111111-1111-4111-8111-111111111111";
  const payload: SignedPayload = {
    event: "booking_created",
    data: { bookingId: "123" },
    timestamp,
    nonce,
    ...overrides,
  };
  const body = JSON.stringify(payload);
  const { header } = signWebhook(body, SECRET, { timestamp, nonce });
  return { body, payload, headers: { [SIGNATURE_HEADER]: header } };
}

describe("webhook replay protection (issue #599)", () => {
  describe("verifyWebhook", () => {
    it("accepts a valid fresh signed payload", () => {
      const { body, headers } = makePayload({}, Date.now());
      const result = verifyWebhook(body, headers, SECRET);
      expect(result.valid).toBe(true);
    });

    it("rejects a tampered payload (body modified after signing)", () => {
      const { body, headers } = makePayload();
      const parsed = JSON.parse(body);
      parsed.data.bookingId = "999";
      const tamperedBody = JSON.stringify(parsed);

      const result = verifyWebhook(tamperedBody, headers, SECRET);
      expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
    });

    it("rejects an expired payload", () => {
      const old = Date.now() - (DEFAULT_MAX_AGE_SECONDS + 60) * 1000;
      const { body, headers } = makePayload({}, old);

      const result = verifyWebhook(body, headers, SECRET);
      expect(result).toEqual({ valid: false, reason: "expired_timestamp" });
    });

    it("rejects a timestamp too far in the future", () => {
      const future = Date.now() + (DEFAULT_MAX_AGE_SECONDS + 300) * 1000;
      const { body, headers } = makePayload({}, future);

      const result = verifyWebhook(body, headers, SECRET);
      expect(result).toEqual({ valid: false, reason: "future_timestamp" });
    });

    it("rejects a replayed payload (same nonce delivered twice)", () => {
      const store = new NonceStore();
      const { body, headers } = makePayload();

      expect(verifyWebhook(body, headers, SECRET, { nonceStore: store }).valid).toBe(true);
      const replay = verifyWebhook(body, headers, SECRET, { nonceStore: store });
      expect(replay).toEqual({ valid: false, reason: "replayed_nonce" });
    });

    it("rejects a validly-signed payload with a reused nonce but different body", () => {
      const store = new NonceStore();
      const first = makePayload({}, Date.now());
      expect(
        verifyWebhook(first.body, first.headers, SECRET, { nonceStore: store }).valid
      ).toBe(true);

      // Attacker re-signs nothing — they cannot produce a second valid
      // signature for the same nonce without the secret.
      const secondBody = JSON.stringify({ ...first.payload, event: "booking_refunded" });
      const result = verifyWebhook(secondBody, first.headers, SECRET, {
        nonceStore: store,
      });
      expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
    });

    it("rejects payloads signed with the wrong secret", () => {
      const { body, headers } = makePayload();
      const result = verifyWebhook(body, headers, "attacker-controlled-secret");
      expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
    });

    it("rejects requests missing the signature header", () => {
      const { body } = makePayload();
      const result = verifyWebhook(body, {}, SECRET);
      expect(result).toEqual({ valid: false, reason: "missing_signature" });
    });

    it("rejects malformed signature headers", () => {
      const { body } = makePayload();
      const result = verifyWebhook(
        body,
        { [SIGNATURE_HEADER]: "not-a-real-signature" },
        SECRET
      );
      expect(result).toEqual({ valid: false, reason: "malformed_signature" });
    });

    it("rejects payloads without a nonce", () => {
      const { body, headers } = makePayload();
      const parsed = JSON.parse(body);
      delete parsed.nonce;

      const result = verifyWebhook(JSON.stringify(parsed), headers, SECRET);
      expect(["missing_nonce", "signature_mismatch"]).toContain(
        (result as { reason?: string }).reason
      );
      expect(result.valid).toBe(false);
    });

    it("forgets nonces after the TTL elapses (NonceStore expiry)", () => {
      const ttlMs = 60_000;
      const store = new NonceStore(ttlMs);
      let now = 1_700_000_000_000;

      expect(store.checkAndRecord("nonce-a", now)).toBe(true);
      // Same instant => replay detected
      expect(store.checkAndRecord("nonce-a", now)).toBe(false);
      // Still inside the TTL window => still remembered
      expect(store.checkAndRecord("nonce-a", now + ttlMs - 1)).toBe(false);
      // Past the TTL => forgotten, key can be recorded again
      expect(store.checkAndRecord("nonce-a", now + ttlMs + 1)).toBe(true);
    });
  });
});

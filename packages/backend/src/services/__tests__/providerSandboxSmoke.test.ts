import {
  ProviderSandboxConfig,
  SmokeHttpClient,
  amadeusSandboxFromEnv,
  runProviderSandboxSmoke,
  smokeCheckProvider,
} from "../providerSandboxSmoke";

const configured: ProviderSandboxConfig = {
  name: "amadeus",
  clientId: "id-123",
  clientSecret: "secret-xyz",
  baseUrl: "https://test.api.amadeus.com",
};

describe("provider sandbox smoke (#916)", () => {
  it("skips providers without credentials", async () => {
    const http = jest.fn() as unknown as SmokeHttpClient;
    const result = await smokeCheckProvider(
      { name: "amadeus", baseUrl: "https://test.api.amadeus.com" },
      http,
    );

    expect(result.skipped).toBe(true);
    expect(result.success).toBe(true);
    expect(http).not.toHaveBeenCalled();
  });

  it("authenticates and accepts a minimal search payload", async () => {
    const http: SmokeHttpClient = jest.fn(async (method) => {
      if (method === "POST") {
        return { status: 200, data: { access_token: "tok_abc" } };
      }
      return { status: 200, data: { data: [{ id: "offer-1" }] } };
    });

    const result = await smokeCheckProvider(configured, http);
    expect(result.success).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.searchOk).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("fails authentication without logging secrets", async () => {
    const events: Record<string, unknown>[] = [];
    const http: SmokeHttpClient = jest.fn(async () => ({
      status: 401,
      data: { error: "invalid_client" },
    }));

    const result = await smokeCheckProvider(configured, http, (event) => events.push(event));
    expect(result.success).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(JSON.stringify(events)).not.toContain("secret-xyz");
    expect(JSON.stringify(events)).not.toContain("id-123");
  });

  it("retries a failed search once, then fails", async () => {
    const http: SmokeHttpClient = jest.fn(async (method) => {
      if (method === "POST") {
        return { status: 200, data: { access_token: "tok_abc" } };
      }
      throw new Error("upstream timeout secret-xyz");
    });

    const result = await smokeCheckProvider(configured, http);
    expect(result.success).toBe(false);
    expect(result.searchOk).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error).toContain("[redacted]");
    expect(result.error).not.toContain("secret-xyz");
  });

  it("reports overall failure when any configured provider fails", async () => {
    const http: SmokeHttpClient = jest.fn(async () => ({ status: 500, data: {} }));
    const summary = await runProviderSandboxSmoke(
      [configured, { name: "sabre", baseUrl: "https://example.invalid" }],
      http,
    );
    expect(summary.success).toBe(false);
    expect(summary.results[1].skipped).toBe(true);
  });

  it("reads Amadeus sandbox settings from the environment", () => {
    const cfg = amadeusSandboxFromEnv({
      AMADEUS_CLIENT_ID: "from-env",
      AMADEUS_CLIENT_SECRET: "env-secret",
      AMADEUS_BASE_URL: "https://test.api.amadeus.com",
    } as NodeJS.ProcessEnv);
    expect(cfg.clientId).toBe("from-env");
    expect(cfg.name).toBe("amadeus");
  });
});

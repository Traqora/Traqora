/**
 * Credential-safe airline-provider sandbox smoke checks (#916).
 *
 * Validates authentication and a minimal search response for each configured
 * provider before deployment promotion. Secrets are never logged.
 *
 * Expected behavior
 * -----------------
 * - Unconfigured providers are skipped (`skipped: true`).
 * - Configured providers authenticate, then run a one-offer search.
 * - Success requires a 2xx auth response and a search payload with `data`.
 *
 * Failure / retry cases
 * ---------------------
 * - Auth 4xx/5xx or network errors fail the provider.
 * - Transient search failures retry once, then fail.
 * - Logs include provider name and status only — never client secrets or tokens.
 */

export interface ProviderSandboxConfig {
  name: string;
  clientId?: string;
  clientSecret?: string;
  baseUrl: string;
  /** Minimal search used after auth. */
  searchPath?: string;
  searchParams?: Record<string, string>;
}

export interface ProviderSmokeResult {
  provider: string;
  skipped: boolean;
  success: boolean;
  authenticated?: boolean;
  searchOk?: boolean;
  attempts: number;
  error?: string;
}

export interface HttpResponse {
  status: number;
  data?: unknown;
}

export type SmokeHttpClient = (
  method: "POST" | "GET",
  url: string,
  init: {
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<HttpResponse>;

const DEFAULT_SEARCH_PATH = "/v2/shopping/flight-offers";
const DEFAULT_SEARCH_PARAMS = {
  originLocationCode: "JFK",
  destinationLocationCode: "LAX",
  departureDate: "2026-11-15",
  adults: "1",
  max: "1",
};

function redactError(message: string, secretValues: string[]): string {
  let out = message;
  for (const secret of secretValues) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}

function extractAccessToken(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const token = (data as { access_token?: unknown }).access_token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function searchLooksValid(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const payload = data as { data?: unknown };
  return Array.isArray(payload.data);
}

export function isProviderConfigured(config: ProviderSandboxConfig): boolean {
  return Boolean(config.clientId && config.clientSecret && config.baseUrl);
}

export async function smokeCheckProvider(
  config: ProviderSandboxConfig,
  http: SmokeHttpClient,
  log: (event: Record<string, unknown>) => void = () => undefined,
): Promise<ProviderSmokeResult> {
  const secrets = [config.clientId || "", config.clientSecret || ""];
  if (!isProviderConfigured(config)) {
    log({ provider: config.name, event: "skipped", reason: "not_configured" });
    return {
      provider: config.name,
      skipped: true,
      success: true,
      attempts: 0,
    };
  }

  const tokenUrl = `${config.baseUrl.replace(/\/$/, "")}/v1/security/oauth2/token`;
  let attempts = 0;
  try {
    attempts += 1;
    const auth = await http("POST", tokenUrl, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId as string,
        client_secret: config.clientSecret as string,
      }).toString(),
    });
    const accessToken = extractAccessToken(auth.data);
    if (auth.status < 200 || auth.status >= 300 || !accessToken) {
      log({
        provider: config.name,
        event: "auth_failed",
        status: auth.status,
      });
      return {
        provider: config.name,
        skipped: false,
        success: false,
        authenticated: false,
        attempts,
        error: `Authentication failed with status ${auth.status}`,
      };
    }

    secrets.push(accessToken);
    const searchPath = config.searchPath || DEFAULT_SEARCH_PATH;
    const params = new URLSearchParams(config.searchParams || DEFAULT_SEARCH_PARAMS);
    const searchUrl = `${config.baseUrl.replace(/\/$/, "")}${searchPath}?${params.toString()}`;

    let search: HttpResponse | null = null;
    let lastError: string | undefined;
    for (let retry = 0; retry < 2; retry += 1) {
      attempts += 1;
      try {
        search = await http("GET", searchUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (search.status >= 200 && search.status < 300 && searchLooksValid(search.data)) {
          log({
            provider: config.name,
            event: "ok",
            status: search.status,
          });
          return {
            provider: config.name,
            skipped: false,
            success: true,
            authenticated: true,
            searchOk: true,
            attempts,
          };
        }
        lastError = `Search failed with status ${search.status}`;
      } catch (err) {
        lastError = redactError(err instanceof Error ? err.message : String(err), secrets);
      }
    }

    log({
      provider: config.name,
      event: "search_failed",
      error: lastError,
    });
    return {
      provider: config.name,
      skipped: false,
      success: false,
      authenticated: true,
      searchOk: false,
      attempts,
      error: lastError,
    };
  } catch (err) {
    const error = redactError(err instanceof Error ? err.message : String(err), secrets);
    log({ provider: config.name, event: "failed", error });
    return {
      provider: config.name,
      skipped: false,
      success: false,
      attempts,
      error,
    };
  }
}

export async function runProviderSandboxSmoke(
  providers: ProviderSandboxConfig[],
  http: SmokeHttpClient,
  log: (event: Record<string, unknown>) => void = () => undefined,
): Promise<{ success: boolean; results: ProviderSmokeResult[] }> {
  const results: ProviderSmokeResult[] = [];
  for (const provider of providers) {
    results.push(await smokeCheckProvider(provider, http, log));
  }
  return {
    success: results.every((result) => result.success),
    results,
  };
}

export function amadeusSandboxFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProviderSandboxConfig {
  return {
    name: "amadeus",
    clientId: env.AMADEUS_CLIENT_ID,
    clientSecret: env.AMADEUS_CLIENT_SECRET,
    baseUrl: env.AMADEUS_BASE_URL || "https://test.api.amadeus.com",
  };
}

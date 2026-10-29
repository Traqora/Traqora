/**
 * CLI entry for provider sandbox smoke checks (#916).
 *
 * Exits 0 when every configured provider authenticates and returns a minimal
 * search payload, or when no providers are configured (skip). Exits 1 on
 * auth/search failure. Secrets are never printed.
 */
import axios from "axios";
import {
  amadeusSandboxFromEnv,
  runProviderSandboxSmoke,
  type SmokeHttpClient,
} from "../src/services/providerSandboxSmoke";

const http: SmokeHttpClient = async (method, url, init) => {
  const response = await axios.request({
    method,
    url,
    headers: init.headers,
    data: init.body,
    timeout: 15000,
    validateStatus: () => true,
  });
  return { status: response.status, data: response.data };
};

async function main(): Promise<void> {
  const summary = await runProviderSandboxSmoke(
    [amadeusSandboxFromEnv()],
    http,
    (event) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(event));
    },
  );

  if (!summary.success) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: "fatal", error: message }));
  process.exit(1);
});

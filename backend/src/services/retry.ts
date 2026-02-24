export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const withRetries = async <T>(fn: () => Promise<T>, opts?: { retries?: number; baseDelayMs?: number }) => {
  const retries = opts?.retries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 250;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
};

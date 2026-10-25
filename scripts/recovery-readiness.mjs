/**
 * @param {string} url
 * @param {{ now?: () => number, fetcher?: (url: string, init: {signal: AbortSignal}) => Promise<{ok: boolean}>, sleep?: (ms: number) => Promise<void> }} options
 */
export async function waitForRecoveryReadiness(
  url,
  {
    now = () => performance.now(),
    fetcher = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const started = now();
  const deadline = started + 30000;
  let attempts = 0;
  while (now() < deadline) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    attempts++;
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(
          Math.max(1, Math.floor(Math.min(2000, remaining))),
        ),
      });
      if (response.ok) {
        const finished = now();
        return {
          recovered: finished <= deadline,
          elapsedMs: finished - started,
          attempts,
        };
      }
    } catch {
      // Expected while the fixture backend is restarting; the deadline still applies.
    }
    const waitMs = Math.min(500, deadline - now());
    if (waitMs > 0) await sleep(waitMs);
  }
  return { recovered: false, elapsedMs: now() - started, attempts };
}

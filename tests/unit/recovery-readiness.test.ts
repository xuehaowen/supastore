import { afterEach, expect, it, vi } from "vitest";
import { waitForRecoveryReadiness } from "../../scripts/recovery-readiness.mjs";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("uses the runtime clock, fetch and timer when no test adapters are supplied", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "performance"] });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true }),
  );
  const pending = waitForRecoveryReadiness("http://fixture/ready");
  await vi.advanceTimersByTimeAsync(500);
  expect(await pending).toEqual({
    recovered: true,
    elapsedMs: 500,
    attempts: 2,
  });
});

it("measures successful readiness recovery", async () => {
  let clock = 0;
  const result = await waitForRecoveryReadiness("http://fixture/ready", {
    now: () => clock,
    fetcher: async () => {
      clock += 25;
      return { ok: true };
    },
    sleep: async (ms: number) => {
      clock += ms;
    },
  });
  expect(result).toEqual({ recovered: true, elapsedMs: 25, attempts: 1 });
});

it("bounds failed or timed-out requests and waits by the 30-second deadline", async () => {
  let clock = 0;
  const sleeps: number[] = [];
  const result = await waitForRecoveryReadiness("http://fixture/ready", {
    now: () => clock,
    fetcher: async () => {
      clock += Math.min(2000, 30000 - clock);
      throw new Error("unavailable");
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  expect(result).toMatchObject({ recovered: false, elapsedMs: 30000 });
  expect(result.attempts).toBeLessThanOrEqual(13);
  expect(sleeps.every((ms) => ms > 0 && ms <= 500)).toBe(true);
});

it("does not accept a response arriving after the deadline", async () => {
  let clock = 0;
  expect(
    await waitForRecoveryReadiness("http://fixture/ready", {
      now: () => clock,
      fetcher: async () => {
        clock = 30001;
        return { ok: true };
      },
      sleep: async () => {
        throw new Error("must not wait after deadline");
      },
    }),
  ).toEqual({ recovered: false, elapsedMs: 30001, attempts: 1 });
});

it("retries unhealthy HTTP responses and caps the last wait at the remaining budget", async () => {
  let clock = 0;
  let waited = 0;
  const result = await waitForRecoveryReadiness("http://fixture/ready", {
    now: () => clock,
    fetcher: async () => {
      clock = 29900;
      return { ok: false };
    },
    sleep: async (ms: number) => {
      waited = ms;
      clock += ms;
    },
  });
  expect(waited).toBe(100);
  expect(result).toEqual({ recovered: false, elapsedMs: 30000, attempts: 1 });
});

it("does not start a request when the deadline expires between clock readings", async () => {
  const times = [0, 0, 30000, 30000];
  const fetcher = vi.fn();
  const result = await waitForRecoveryReadiness("http://fixture/ready", {
    now: () => times.shift() ?? 30000,
    fetcher,
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(result).toEqual({ recovered: false, elapsedMs: 30000, attempts: 0 });
});

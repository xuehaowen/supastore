import { expect, it } from "vitest";
import { waitForRecoveryReadiness } from "../../scripts/recovery-readiness.mjs";

it("measures successful readiness recovery", async () => {
  let clock = 0;
  const result = await waitForRecoveryReadiness("http://fixture/ready", {
    now: () => clock,
    fetcher: async () => { clock += 25; return { ok: true }; },
    sleep: async (ms: number) => { clock += ms; },
  });
  expect(result).toEqual({ recovered: true, elapsedMs: 25, attempts: 1 });
});

it("bounds failed or timed-out requests and waits by the 30-second deadline", async () => {
  let clock = 0;
  const sleeps: number[] = [];
  const result = await waitForRecoveryReadiness("http://fixture/ready", {
    now: () => clock,
    fetcher: async () => { clock += Math.min(2000, 30000 - clock); throw new Error("unavailable"); },
    sleep: async (ms: number) => { sleeps.push(ms); clock += ms; },
  });
  expect(result).toMatchObject({ recovered: false, elapsedMs: 30000 });
  expect(result.attempts).toBeLessThanOrEqual(13);
  expect(sleeps.every(ms => ms > 0 && ms <= 500)).toBe(true);
});

it("does not accept a response arriving after the deadline", async () => {
  let clock = 0;
  expect(await waitForRecoveryReadiness("http://fixture/ready", {
    now: () => clock,
    fetcher: async () => { clock = 30001; return { ok: true }; },
    sleep: async () => { throw new Error("must not wait after deadline"); },
  })).toEqual({ recovered: false, elapsedMs: 30001, attempts: 1 });
});

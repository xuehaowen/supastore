import { describe, expect, it, vi } from "vitest";
import {
  createWorkerRunner,
  resetWorkerState,
  workerHealth,
} from "@/infrastructure/runtime/worker";

describe("independent worker jobs", () => {
  it("reports partial record failures and deferred failures until recovery", async () => {
    let now = 0;
    const run = vi.fn().mockResolvedValue({
      succeeded: 2,
      failed: 1,
      deferred: 0,
      reviewRequired: 0,
    });
    const runner = createWorkerRunner(
      [{ name: "payments", intervalMs: 1000, run }],
      { now: () => now, onError: vi.fn() },
    );
    await runner.tick();
    expect(workerHealth(now).status).toBe("degraded");
    expect(workerHealth(now).jobs.payments).toMatchObject({
      lastResult: { succeeded: 2, failed: 1 },
    });
    now = 1000;
    run.mockResolvedValue({
      succeeded: 0,
      failed: 0,
      deferred: 1,
      reviewRequired: 0,
    });
    await runner.tick();
    expect(workerHealth(now).status).toBe("degraded");
    now = 2000;
    run.mockResolvedValue({
      succeeded: 1,
      failed: 0,
      deferred: 0,
      reviewRequired: 0,
    });
    await runner.tick();
    expect(workerHealth(now).status).toBe("ok");
    runner.stop();
  });
  it("continues other jobs after one fails and preserves the exception", async () => {
    let now = 1000;
    const failure = new Error("Provider unavailable");
    const email = vi.fn().mockRejectedValue(failure),
      sms = vi.fn(),
      errors = vi.fn();
    const runner = createWorkerRunner(
      [
        { name: "email", intervalMs: 5000, run: email },
        { name: "sms", intervalMs: 5000, run: sms },
      ],
      { now: () => now, onError: errors },
    );
    await runner.tick();
    expect(sms).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalledWith("email", failure);
    expect(workerHealth(now).status).toBe("degraded");
    email.mockResolvedValue(1);
    now += 5000;
    await runner.tick();
    expect(workerHealth(now).status).toBe("ok");
    runner.stop();
  });
  it("schedules maintenance by time and does not duplicate a running job", async () => {
    let now = 0;
    let release!: () => void;
    const email = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const sms = vi.fn();
    const maintenance = vi.fn();
    const runner = createWorkerRunner(
      [
        { name: "email", intervalMs: 5000, run: email },
        { name: "sms", intervalMs: 5000, run: sms },
        {
          name: "maintenance",
          intervalMs: 3600000,
          runImmediately: false,
          run: maintenance,
        },
      ],
      { now: () => now, onError: vi.fn() },
    );
    const first = runner.tick();
    await Promise.resolve();
    now = 5000;
    await runner.tick();
    expect(email).toHaveBeenCalledOnce();
    expect(sms).toHaveBeenCalledTimes(2);
    now = 3600000;
    await runner.tick();
    expect(maintenance).toHaveBeenCalledOnce();
    release();
    await first;
    runner.stop();
  });
  it("reports disabled, starting, and stalled states", async () => {
    resetWorkerState();
    expect(workerHealth(0).status).toBe("disabled");
    let now = 0;
    let release!: () => void;
    const runner = createWorkerRunner(
      [
        {
          name: "email",
          intervalMs: 5000,
          maxRunMs: 10000,
          run: () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        },
      ],
      { now: () => now, onError: vi.fn() },
    );
    expect(workerHealth(now).status).toBe("starting");
    const pending = runner.tick();
    now = 10001;
    expect(workerHealth(now).status).toBe("stalled");
    release();
    await pending;
    runner.stop();
    expect(workerHealth(now).status).toBe("disabled");
  });
});

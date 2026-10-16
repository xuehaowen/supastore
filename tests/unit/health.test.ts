import { describe, it, expect, vi } from "vitest";
import { GET as getLive } from "@/app/api/health/live/route";
import { GET as getReady } from "@/app/api/health/ready/route";
import { GET as getWorker } from "@/app/api/health/worker/route";
import { db } from "@/infrastructure/db";
import {
  createWorkerRunner,
  resetWorkerState,
} from "@/infrastructure/runtime/worker";

describe("Health Endpoints", () => {
  it("reports notifications requiring review as degraded even when the scheduler runs", async () => {
    const runner = createWorkerRunner(
      [{ name: "fixture", intervalMs: 5000, run: async () => 0 }],
      { onError: vi.fn() },
    );
    await runner.tick();
    vi.spyOn(db, "execute")
      .mockResolvedValueOnce([{ status: "review", count: 1 }] as any)
      .mockResolvedValueOnce([] as any);
    const response = await getWorker();
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("degraded");
    runner.stop();
  });
  it("/api/health/live returns 200 with status ok and uptime", async () => {
    const response = await getLive();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.timestamp).toBeDefined();
  });

  it("/api/health/ready returns 200 when database executes successfully", async () => {
    vi.spyOn(db, "execute").mockResolvedValueOnce([] as any);

    const response = await getReady();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.database).toBe("connected");
  });

  it("/api/health/ready returns 503 when database throws error", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(
      new Error("Connection terminated"),
    );

    const response = await getReady();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe("unhealthy");
    expect(body.database).toBe("disconnected");
    expect(body.error).toBe("Database query failed");
  });

  it("/api/health/worker returns 200 with outbox metrics", async () => {
    const runner = createWorkerRunner(
      [{ name: "fixture", intervalMs: 5000, run: async () => 0 }],
      { onError: vi.fn() },
    );
    await runner.tick();
    vi.spyOn(db, "execute")
      .mockResolvedValueOnce([
        { status: "pending", count: 3 },
        { status: "delivered", count: 15 },
      ] as any)
      .mockResolvedValueOnce([
        { oldest_pending: new Date(Date.now() - 30_000).toISOString() },
      ] as any);

    const response = await getWorker();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.outbox.pending).toBe(3);
    expect(body.outbox.delivered).toBe(15);
    expect(body.outbox.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(25);
    runner.stop();
  });
  it("reports a disabled worker instead of healthy database-only metrics", async () => {
    resetWorkerState();
    vi.spyOn(db, "execute").mockResolvedValue([] as any);
    const response = await getWorker();
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("disabled");
  });
  it("does not expose database exception details", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(
      new Error("private database credentials"),
    );
    const response = await getWorker();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database credentials");
  });
});

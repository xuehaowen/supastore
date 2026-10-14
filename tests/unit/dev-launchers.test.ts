import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startBackend } from "../../scripts/backend.mjs";
import { startStorefront } from "../../scripts/storefront.mjs";
const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn((..._args: unknown[]) => ({ once: vi.fn(), kill: vi.fn() })),
}));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));
vi.mock("node:fs", () => ({
  readFileSync: () =>
    "DATABASE_URL=private-database\nSMTP_PASSWORD=private-smtp\nBACKEND_URL=http://127.0.0.1:3000\n",
}));
beforeEach(() => {
  spawnMock.mockClear();
  for (const key of [
    "APP_URL",
    "STOREFRONT_ORIGIN",
    "BETTER_AUTH_URL",
    "BACKEND_URL",
    "STOREFRONT_PORT",
  ])
    vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("separate development launchers", () => {
  it("builds the storefront without a server port and without loading backend secrets", () => {
    startStorefront("build");
    const call = spawnMock.mock.calls[0]!;
    expect(call[1]).toEqual([
      expect.stringContaining("next"),
      "build",
      "apps/storefront",
    ]);
    const config = call[2] as { env: Record<string, string | undefined> };
    expect(config.env.BACKEND_URL).toBe("http://127.0.0.1:3000");
    expect(config.env.DATABASE_URL).not.toBe("private-database");
    expect(config.env.SMTP_PASSWORD).not.toBe("private-smtp");
  });
  it("starts the production storefront on its configured port", () => {
    vi.stubEnv("STOREFRONT_PORT", "4001");
    startStorefront("start");
    expect(spawnMock.mock.calls[0]![1]).toEqual([
      expect.stringContaining("next"),
      "start",
      "apps/storefront",
      "-p",
      "4001",
    ]);
  });
  it("rejects unsupported commands before creating a process", () => {
    expect(() => startStorefront("unsupported")).toThrow(
      "Expected dev, build or start",
    );
    expect(() => startBackend("unsupported")).toThrow(
      "Expected dev, build or start",
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });
  it("marks production backend builds without injecting development origins", () => {
    startBackend("build");
    const call = spawnMock.mock.calls[0]!;
    expect(call[1]).toEqual([
      expect.stringContaining("next"),
      "build",
      "apps/backend",
    ]);
    const config = call[2] as { env: Record<string, string | undefined> };
    expect(config.env.SERVICE_ROLE).toBe("backend");
    expect(config.env.STOREFRONT_ORIGIN).toBeUndefined();
  });
  it.each(["dev", "start"])(
    "uses the same public origin for %s when a custom storefront port is selected",
    (command) => {
      vi.stubEnv("STOREFRONT_PORT", "3002");
      startBackend(command);
      startStorefront(command);
      const backend = spawnMock.mock.calls[0]![2] as {
        env: Record<string, string>;
      };
      const storefront = spawnMock.mock.calls[1]![2] as {
        env: Record<string, string>;
      };
      expect(backend.env.APP_URL).toBe("http://localhost:3002");
      expect(backend.env.BETTER_AUTH_URL).toBe("http://localhost:3002");
      expect(backend.env.STOREFRONT_ORIGIN).toBe(
        storefront.env.STOREFRONT_ORIGIN,
      );
      expect(storefront.env.DATABASE_URL).not.toBe("private-database");
      expect(storefront.env.SMTP_PASSWORD).not.toBe("private-smtp");
    },
  );
  it.each(["dev", "start"])(
    "preserves an explicit public origin for %s in both processes",
    (command) => {
      vi.stubEnv("STOREFRONT_ORIGIN", "http://localhost:4001");
      startBackend(command);
      startStorefront(command);
      for (const call of spawnMock.mock.calls) {
        expect(
          (call[2] as { env: Record<string, string> }).env.STOREFRONT_ORIGIN,
        ).toBe("http://localhost:4001");
      }
    },
  );
});

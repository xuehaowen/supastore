import { expect, it, vi } from "vitest";
import { checkDeployment } from "../../scripts/check-deployment.mjs";
import { securityHeaders } from "../../packages/config/security-headers.mjs";

const env = { STOREFRONT_ORIGIN: "https://shop.example.test", BACKEND_URL: "http://backend:3000", EDGE_PROXY_SECRET: "fixture-edge-secret-at-least-32-bytes", MIGRATION_DATABASE_URL: "postgresql://private:secret@database/store" };
const migrations = [{ hash: "fixture-hash", folderMillis: 100 }];
const inspectDatabase = vi.fn(async () => [{ hash: "fixture-hash", created_at: "100" }]);
const fetcher = vi.fn(async () => new Response(null, { headers: Object.fromEntries(securityHeaders.map(header => [header.key, header.value])) }));

it("does not make network connections unless explicitly requested", async () => {
  const inspect = vi.fn(); const fetch = vi.fn();
  const report = await checkDeployment(env, { migrations, inspectDatabase: inspect, fetcher: fetch });
  expect(inspect).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  expect(report.complete).toBe(false); expect(report.passed).toBe(false);
  expect(report.checks.find(check => check.name === "migrations")?.status).toBe("not_checked");
});
it("passes matching migrations and headers without exposing credentials", async () => {
  const report = await checkDeployment(env, { connect: true, migrations, inspectDatabase, fetcher });
  expect(report.complete).toBe(true); expect(report.passed).toBe(true);
  expect(report.manualChecks.length).toBeGreaterThan(0);
  expect(JSON.stringify(report)).not.toContain("secret@");
  expect(JSON.stringify(report)).not.toContain(env.EDGE_PROXY_SECRET);
});
it.each([
  [{ hash: "wrong", created_at: "100" }], [],
  [{ hash: "fixture-hash", created_at: "100" }, { hash: "newer", created_at: "200" }],
])("rejects missing, divergent or newer migration history", async rows => {
  const report = await checkDeployment(env, { connect: true, migrations, inspectDatabase: async () => rows, fetcher });
  expect(report.checks.find(check => check.name === "migrations")?.status).toBe("fail");
  expect(report.passed).toBe(false);
});
it("rejects public HTTP and short edge secrets", async () => {
  const report = await checkDeployment({ ...env, STOREFRONT_ORIGIN: "http://shop.example.test", EDGE_PROXY_SECRET: "short" }, { migrations });
  expect(report.checks.filter(check => check.status === "fail").map(check => check.name)).toEqual(expect.arrayContaining(["public-origin", "trusted-edge-secret"]));
});
it("fails on missing public headers, redirects and database errors without leaking them", async () => {
  const report = await checkDeployment(env, { connect: true, migrations, inspectDatabase: async () => { throw new Error("postgresql://private:secret@database/store"); }, fetcher: async () => new Response(null, { status: 302, headers: { location: "https://different.example.test" } }) });
  expect(report.checks.find(check => check.name === "migrations")?.status).toBe("fail");
  expect(report.checks.find(check => check.name === "public-headers")?.status).toBe("fail");
  expect(JSON.stringify(report)).not.toContain("private:secret");
});

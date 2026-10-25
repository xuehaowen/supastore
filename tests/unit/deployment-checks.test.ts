import { expect, it, vi } from "vitest";
import {
  checkDeployment,
  readDeploymentMigrations,
} from "../../scripts/check-deployment.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { securityHeaders } from "../../packages/config/security-headers.mjs";

const env = {
  STOREFRONT_ORIGIN: "https://shop.example.test",
  BACKEND_URL: "http://backend:3000",
  EDGE_PROXY_SECRET: "fixture-edge-secret-at-least-32-bytes",
  MIGRATION_DATABASE_URL: "postgresql://private:secret@database/store",
};
const migrations = [{ hash: "fixture-hash", folderMillis: 100 }];
const inspectDatabase = vi.fn(async () => [
  { hash: "fixture-hash", created_at: "100" },
]);
const fetcher = vi.fn(
  async () =>
    new Response(null, {
      headers: Object.fromEntries(
        securityHeaders.map((header) => [header.key, header.value]),
      ),
    }),
);

it("accepts LF and CRLF checkouts while still rejecting changed SQL", async () => {
  mkdirSync(".tmp-cuj", { recursive: true });
  const folder = mkdtempSync(".tmp-cuj/readiness-migrations-");
  try {
    mkdirSync(join(folder, "meta"));
    writeFileSync(
      join(folder, "meta/_journal.json"),
      JSON.stringify({
        entries: [{ tag: "0000_fixture", when: 100, breakpoints: true }],
      }),
    );
    const sql =
      "CREATE TABLE fixture(id integer);\n--> statement-breakpoint\nSELECT 1;\n";
    const deployed = createHash("sha256").update(sql).digest("hex");
    writeFileSync(
      join(folder, "0000_fixture.sql"),
      sql.replaceAll("\n", "\r\n"),
    );
    const options = {
      connect: true,
      migrations: readDeploymentMigrations(folder),
      inspectDatabase: async () => [{ hash: deployed, created_at: "100" }],
      fetcher,
    };
    expect((await checkDeployment(env, options)).passed).toBe(true);
    writeFileSync(
      join(folder, "0000_fixture.sql"),
      sql.replace("SELECT 1", "SELECT 2"),
    );
    expect(
      (
        await checkDeployment(env, {
          ...options,
          migrations: readDeploymentMigrations(folder),
        })
      ).passed,
    ).toBe(false);
  } finally {
    if (!resolve(folder).startsWith(resolve(".tmp-cuj") + sep))
      throw new Error("Migration fixture escaped workspace.");
    rmSync(folder, { recursive: true, force: true });
  }
});

it("does not make network connections unless explicitly requested", async () => {
  const inspect = vi.fn();
  const fetch = vi.fn();
  const report = await checkDeployment(env, {
    migrations,
    inspectDatabase: inspect,
    fetcher: fetch,
  });
  expect(inspect).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(report.complete).toBe(false);
  expect(report.passed).toBe(false);
  expect(
    report.checks.find((check) => check.name === "migrations")?.status,
  ).toBe("not_checked");
});
it("passes matching migrations and headers without exposing credentials", async () => {
  const report = await checkDeployment(env, {
    connect: true,
    migrations,
    inspectDatabase,
    fetcher,
  });
  expect(report.complete).toBe(true);
  expect(report.passed).toBe(true);
  expect(report.manualChecks.length).toBeGreaterThan(0);
  expect(JSON.stringify(report)).not.toContain("secret@");
  expect(JSON.stringify(report)).not.toContain(env.EDGE_PROXY_SECRET);
});
it.each([
  { rows: [{ hash: "wrong", created_at: "100" }] },
  { rows: [] },
  {
    rows: [
      { hash: "fixture-hash", created_at: "100" },
      { hash: "newer", created_at: "200" },
    ],
  },
])(
  "rejects missing, divergent or newer migration history",
  async ({ rows }) => {
    const report = await checkDeployment(env, {
      connect: true,
      migrations,
      inspectDatabase: async () => rows,
      fetcher,
    });
    expect(
      report.checks.find((check) => check.name === "migrations")?.status,
    ).toBe("fail");
    expect(report.passed).toBe(false);
  },
);
it("rejects public HTTP and short edge secrets", async () => {
  const report = await checkDeployment(
    {
      ...env,
      STOREFRONT_ORIGIN: "http://shop.example.test",
      EDGE_PROXY_SECRET: "short",
    },
    { migrations },
  );
  expect(
    report.checks
      .filter((check) => check.status === "fail")
      .map((check) => check.name),
  ).toEqual(expect.arrayContaining(["public-origin", "trusted-edge-secret"]));
});
it("accepts additional restrictive policies applied by a trusted proxy", async () => {
  const headers = new Headers(
    Object.fromEntries(
      securityHeaders.map((header) => [header.key, header.value]),
    ),
  );
  headers.set(
    "strict-transport-security",
    "max-age=63072000; includeSubDomains",
  );
  // A single policy containing the baseline plus another restriction.
  headers.set(
    "content-security-policy",
    securityHeaders.find((header) => header.key === "Content-Security-Policy")!
      .value + "; script-src 'self'",
  );
  const report = await checkDeployment(env, {
    connect: true,
    migrations,
    inspectDatabase,
    fetcher: async () => new Response(null, { headers }),
  });
  expect(report.passed).toBe(true);
});

it("fails closed on missing headers and unreachable public routes", async () => {
  for (const fetcher of [
    async () => new Response(null),
    async () => {
      throw new Error("private proxy diagnostic");
    },
  ]) {
    const report = await checkDeployment(env, {
      connect: true,
      migrations,
      inspectDatabase,
      fetcher,
    });
    expect(
      report.checks.find((check) => check.name === "public-headers")?.status,
    ).toBe("fail");
    expect(JSON.stringify(report)).not.toContain("private proxy diagnostic");
  }
});
it("rejects conflicting origins, malformed backends and missing database credentials", async () => {
  const inspect = vi.fn();
  const fetch = vi.fn();
  const report = await checkDeployment(
    {
      ...env,
      APP_URL: "https://different.example.test",
      BACKEND_URL: "http://private:secret@backend/path",
      MIGRATION_DATABASE_URL: undefined,
    },
    { connect: true, migrations, inspectDatabase: inspect, fetcher: fetch },
  );
  expect(
    report.checks
      .filter((check) => check.status === "fail")
      .map((check) => check.name),
  ).toEqual(
    expect.arrayContaining([
      "public-origin",
      "backend-origin",
      "migrations",
      "public-headers",
    ]),
  );
  expect(inspect).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.stringify(report)).not.toContain("private:secret");
});
it("fails on missing public headers, redirects and database errors without leaking them", async () => {
  const report = await checkDeployment(env, {
    connect: true,
    migrations,
    inspectDatabase: async () => {
      throw new Error("postgresql://private:secret@database/store");
    },
    fetcher: async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://different.example.test" },
      }),
  });
  expect(
    report.checks.find((check) => check.name === "migrations")?.status,
  ).toBe("fail");
  expect(
    report.checks.find((check) => check.name === "public-headers")?.status,
  ).toBe("fail");
  expect(JSON.stringify(report)).not.toContain("private:secret");
});

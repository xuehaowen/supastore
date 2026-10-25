import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { securityHeaders } from "../packages/config/security-headers.mjs";

const migrationsFolder = fileURLToPath(
  new URL("../apps/backend/src/infrastructure/db/migrations/", import.meta.url),
);

/** Accept Git's LF/CRLF checkout variants without accepting SQL content drift.
 * @param {string} folder
 */
export function readDeploymentMigrations(folder = migrationsFolder) {
  return readMigrationFiles({ migrationsFolder: folder }).map((migration) => {
    const lf = migration.sql
      .join("--> statement-breakpoint")
      .replaceAll("\r\n", "\n");
    return {
      ...migration,
      alternateHashes: [lf, lf.replaceAll("\n", "\r\n")].map((sql) =>
        createHash("sha256").update(sql).digest("hex"),
      ),
    };
  });
}

/** Check the baseline while allowing a longer HSTS lifetime and extra CSP directives.
 * @param {Headers} headers
 */
function hasSecurityHeaders(headers) {
  return securityHeaders.every((header) => {
    const actual = headers.get(header.key)?.trim();
    if (!actual) return false;
    if (header.key === "Strict-Transport-Security") {
      const maxAge = /(?:^|;)\s*max-age\s*=\s*(\d+)\s*(?:;|$)/i.exec(actual);
      return Boolean(maxAge && Number(maxAge[1]) >= 31536000);
    }
    if (header.key === "Content-Security-Policy") {
      const directives = actual
        .split(";")
        .map((value) => value.trim().split(/\s+/));
      return header.value.split(";").every((expected) => {
        const [name, ...values] = expected.trim().split(/\s+/);
        const directive = directives.find(
          (value) => value[0]?.toLowerCase() === name,
        );
        return (
          directive &&
          (directive.slice(1).join(" ") === "'none'" ||
            directive.slice(1).join(" ") === values.join(" "))
        );
      });
    }
    return actual === header.value;
  });
}

/** Query only migration metadata, using a read-only transaction even with migration credentials.
 * @param {string} connection
 */
export async function readDeploymentMigrationHistory(connection) {
  const sql = postgres(connection, {
    max: 1,
    connect_timeout: 10,
    connection: {
      application_name: "supastore-readiness",
      statement_timeout: "10000",
      default_transaction_read_only: "on",
    },
  });
  try {
    return await sql.begin(
      "read only",
      async (tx) =>
        tx`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
}

/** Read-only configuration and optional live checks. Never returns credentials or raw errors.
 * @param {Record<string, string | undefined>} env
 * @param {{ connect?: boolean, migrations?: Array<{hash: string, folderMillis: number, alternateHashes?: string[]}>, inspectDatabase?: (connection: string) => Promise<Array<{hash: string, created_at: string | number}>>, fetcher?: typeof fetch }} options
 */
export async function checkDeployment(
  env,
  {
    connect = false,
    migrations,
    inspectDatabase = readDeploymentMigrationHistory,
    fetcher = fetch,
  } = {},
) {
  /** @type {Array<{name: string, status: "pass" | "fail" | "not_checked", message: string}>} */
  const checks = [];
  /** @param {string} name @param {boolean} passed @param {string} message */
  const add = (name, passed, message) =>
    checks.push({ name, status: passed ? "pass" : "fail", message });
  let origin;
  try {
    const urls = [env.STOREFRONT_ORIGIN, env.APP_URL, env.BETTER_AUTH_URL]
      .filter(Boolean)
      .map((value) => new URL(value));
    if (
      !urls.length ||
      urls.some(
        (url) =>
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.pathname !== "/" ||
          url.origin !== urls[0].origin,
      )
    )
      throw new Error("Invalid origin");
    origin = urls[0].origin;
  } catch {
    /* Report a fixed message; URL parse errors can include credentials. */
  }
  add(
    "public-origin",
    Boolean(origin),
    origin
      ? "Public origins agree and use HTTPS."
      : "Set matching bare HTTPS public origins without credentials.",
  );
  const edgeConfigured = Boolean(
    env.EDGE_PROXY_SECRET &&
    Buffer.byteLength(env.EDGE_PROXY_SECRET, "utf8") >= 32,
  );
  add(
    "trusted-edge-secret",
    edgeConfigured,
    edgeConfigured
      ? "Edge secret has the required length; verify the edge uses it."
      : "Set a random EDGE_PROXY_SECRET of at least 32 bytes at the storefront and trusted edge.",
  );
  let backendConfigured = false;
  try {
    const backend = new URL(env.BACKEND_URL || "http://127.0.0.1:3000");
    backendConfigured =
      ["http:", "https:"].includes(backend.protocol) &&
      !backend.username &&
      !backend.password &&
      backend.pathname === "/" &&
      !backend.search &&
      !backend.hash &&
      backend.origin !== origin;
  } catch {
    /* Fixed diagnostic below. */
  }
  add(
    "backend-origin",
    backendConfigured,
    backendConfigured
      ? "Backend origin is structurally valid; network privacy requires manual verification."
      : "Configure a distinct bare HTTP(S) backend origin without credentials.",
  );
  let expected = migrations;
  try {
    expected ??= readDeploymentMigrations();
  } catch {
    add(
      "migration-files",
      false,
      "Cannot read this release's migration files.",
    );
  }
  if (!connect) {
    checks.push({
      name: "migrations",
      status: "not_checked",
      message:
        "Use --connect to compare the database migration history with this release.",
    });
    checks.push({
      name: "public-headers",
      status: "not_checked",
      message:
        "Use --connect to inspect storefront and admin response headers.",
    });
  } else {
    const connection = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
    if (!connection || !expected?.length)
      add(
        "migrations",
        false,
        "Database credentials and release migration files are required.",
      );
    else {
      try {
        const history = await inspectDatabase(connection);
        const matches =
          history.length === expected.length &&
          expected.every(
            (migration, index) =>
              (history[index]?.hash === migration.hash ||
                migration.alternateHashes?.includes(history[index]?.hash)) &&
              Number(history[index]?.created_at) === migration.folderMillis,
          );
        add(
          "migrations",
          matches,
          matches
            ? "Database migration hashes and revisions match this release."
            : "Database migration history is missing, divergent or newer than this release.",
        );
      } catch {
        add(
          "migrations",
          false,
          "Cannot read migration metadata. Check connectivity and use credentials with SELECT access to the drizzle migration table.",
        );
      }
    }
    if (!origin)
      add(
        "public-headers",
        false,
        "A valid HTTPS public origin is required for header checks.",
      );
    else {
      let healthy = true;
      for (const path of ["/en", "/admin/login"]) {
        try {
          const response = await fetcher(origin + path, {
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
          });
          try {
            if (!response.ok || !hasSecurityHeaders(response.headers))
              healthy = false;
          } finally {
            await response.body?.cancel();
          }
        } catch {
          healthy = false;
        }
      }
      add(
        "public-headers",
        healthy,
        healthy
          ? "Storefront and admin return successful responses with the expected security headers."
          : "Storefront or admin failed, redirected, or lacks the expected security headers.",
      );
    }
  }
  return {
    readOnly: true,
    complete: checks.every((check) => check.status !== "not_checked"),
    passed:
      checks.length > 0 && checks.every((check) => check.status === "pass"),
    checks,
    manualChecks: [
      "Verify the edge overwrites token/client-IP headers and forged values cannot change rate-limit buckets.",
      "Verify direct backend/storefront exposure is blocked as intended by the deployment network.",
      "Complete real provider acceptance, recovery rehearsal and the merchant pilot before production approval.",
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--connect")) {
    console.error("Usage: pnpm check:deployment [--connect]");
    process.exitCode = 2;
  } else {
    const report = await checkDeployment(process.env, {
      connect: args.includes("--connect"),
    });
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exitCode = report.checks.some((check) => check.status === "fail")
      ? 1
      : 0;
  }
}

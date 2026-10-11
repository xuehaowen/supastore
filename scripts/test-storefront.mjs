import { fixtureDirectory } from "./fixture-directory.mjs";
import { measureFixtureResources } from "./measure-fixture-resources.mjs";
import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import EmbeddedPostgres from "embedded-postgres";

// A dedicated synthetic cluster, database and Next cache. Never use the app DB.
const fixture = fixtureDirectory("storefront");
const databaseDir = fixture.path;
const pg = new EmbeddedPostgres({
  databaseDir,
  port: 55449,
  user: "postgres",
  password: "postgres",
  persistent: true,
  onLog: () => {},
  onError: console.error,
});
const database = "supastore_cuj_" + Date.now();
const production = true;
const measure = process.argv.includes("--measure");
const standalone = measure && process.platform === "linux";
const testArguments = process.argv
  .slice(2)
  .filter(
    (argument) => argument !== "--production" && argument !== "--measure",
  );
const env = {
  ...process.env,
  BACKEND_URL: "http://127.0.0.1:3102",
  SERVICE_ROLE: "backend",
  STOREFRONT_TESTS: "true",
  EDGE_PROXY_SECRET: "SyntheticJourneyEdgeSecret123456789!",
  NEXT_DIST_DIR: ".next-cuj/" + database,
  STOREFRONT_ORIGIN: "http://localhost:3103",
  NEXT_TSCONFIG: ".tsconfig-cuj.json",
  STOREFRONT_TSCONFIG: ".tsconfig-cuj.json",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55449/" + database,
  APP_URL: "http://localhost:3103",
  BETTER_AUTH_URL: "http://localhost:3102",
  ADMIN_BASE_URL: "http://localhost:3102",
  PLAYWRIGHT_BASE_URL: "http://localhost:3103",
  ADMIN_SETUP_SECRET: "SyntheticSetupSecret123!",
  BETTER_AUTH_SECRET: "SyntheticAuthSecretForBrowserTests123!",
  M1_DEMO: "true",
  DEMO_OWNER_PASSWORD: "SyntheticOwnerPassword123!",
  DISABLE_OUTBOUND_DELIVERY: "false",
  ENABLE_OUTBOX_WORKER: "false",
  EMAIL_PROVIDER: "nodemailer",
  SMS_PROVIDER: "disabled",
  PHONE_VERIFICATION_PROVIDER: "disabled",
  S3_ENDPOINT: "http://127.0.0.1:9009",
  S3_ACCESS_KEY_ID: "fixture",
  S3_SECRET_ACCESS_KEY: "fixture",
  S3_BUCKET_PRIVATE: "browser-fixture",
  S3_BUCKET_PUBLIC: "browser-public-fixture",
  TEST_STORAGE_PORT: "9009",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "25259",
  SMTP_SECURE: "false",
  SMTP_REQUIRE_TLS: "false",
  SMTP_FROM: "synthetic@example.test",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  NODE_ENV: production ? "production" : "development",
  STANDALONE: standalone ? "true" : "false",
  DOCKER_BUILD: "false",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  TELNYX_API_KEY: "",
};
const children = [];
function completed(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Test process exited with ${code}`)),
    );
  });
}
function start(args, runtime = false, overrides = {}) {
  const child = spawn(process.execPath, args, {
    env: runtime
      ? {
          ...env,
          NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=256",
          ...overrides,
        }
      : env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  return child;
}
async function ready(url, child) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error("Test server exited before readiness");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
let pgCtl;
let postgresBinary;
let databaseProcess;
if (process.platform === "win32") {
  const require = createRequire(import.meta.url);
  const embeddedRequire = createRequire(require.resolve("embedded-postgres"));
  const binaries = await import(
    pathToFileURL(embeddedRequire.resolve("@embedded-postgres/windows-x64"))
      .href
  );
  pgCtl = binaries.pg_ctl;
  postgresBinary = binaries.postgres;
}
function controlPostgres(command) {
  return completed(
    spawn(pgCtl, ["-D", databaseDir, ...command], {
      stdio: "inherit",
      windowsHide: true,
    }),
  );
}
let pgStarted = false;
let stopping;
async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    const failures = [];
    for (const child of [...children].reverse()) {
      try {
        if (child.exitCode !== null || child.signalCode !== null) continue;
        {
          const exited = new Promise((resolve) => child.once("exit", resolve));
          child.kill("SIGTERM");
          await Promise.race([
            exited,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Test server did not stop")),
                10000,
              ),
            ),
          ]);
        }
      } catch (error) {
        failures.push(error);
        child.kill();
      }
    }
    if (pgStarted) {
      if (pgCtl) await controlPostgres(["-m", "fast", "-w", "stop"]);
      else await pg.stop();
    }
    if (!pgStarted && databaseProcess && databaseProcess.exitCode === null) {
      const exited = new Promise((resolve) =>
        databaseProcess.once("exit", resolve),
      );
      databaseProcess.kill();
      await Promise.race([
        exited,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Fixture database did not stop")),
            10000,
          ),
        ),
      ]);
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        "Some test processes did not stop cleanly",
      );
    fixture.cleanup();
  })();
  return stopping;
}
let exitCode = 0;
process.once("SIGINT", () => void stop().finally(() => process.exit(130)));
process.once("SIGTERM", () => void stop().finally(() => process.exit(143)));
try {
  if (!existsSync(`${databaseDir}/PG_VERSION`)) await pg.initialise();
  if (postgresBinary) {
    const child = (databaseProcess = spawn(
      postgresBinary,
      ["-D", databaseDir, "-p", "55449"],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    ));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Test PostgreSQL startup timed out")),
        30000,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once(
        "exit",
        (code) => (
          clearTimeout(timer),
          reject(new Error("Test PostgreSQL exited: " + code))
        ),
      );
      child.stderr.on("data", (data) => {
        if (
          String(data).includes(
            "database system is ready to accept connections",
          )
        ) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  } else await pg.start();
  pgStarted = true;
  const admin = postgres(
    "postgresql://postgres:postgres@127.0.0.1:55449/postgres",
  );
  try {
    await admin.unsafe(
      `CREATE DATABASE "${database}" WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
  } finally {
    await admin.end();
  }
  writeFileSync(env.NEXT_TSCONFIG, readFileSync("tsconfig.json"));
  writeFileSync(
    "apps/storefront/" + env.STOREFRONT_TSCONFIG,
    readFileSync("apps/storefront/tsconfig.json"),
  );
  const mail = start(["scripts/test-mail.mjs"]);
  await ready("http://127.0.0.1:9010", mail);
  start(["scripts/test-storage.mjs"]);

  await completed(
    start(["node_modules/tsx/dist/cli.mjs", "scripts/seed-demo.ts"]),
  );

  if (production)
    await completed(start(["node_modules/next/dist/bin/next", "build"]));
  if (production)
    await completed(
      start(["node_modules/next/dist/bin/next", "build", "apps/storefront"]),
    );
  if (standalone) {
    // Next's generated entry point is CommonJS even when the source package is ESM.
    cpSync(
      join(env.NEXT_DIST_DIR, "standalone/server.js"),
      join(env.NEXT_DIST_DIR, "standalone/server.cjs"),
    );
    cpSync(
      join(env.NEXT_DIST_DIR, "static"),
      join(env.NEXT_DIST_DIR, "standalone", env.NEXT_DIST_DIR, "static"),
      { recursive: true },
    );
    cpSync(
      join("apps/storefront", env.NEXT_DIST_DIR, "static"),
      join(
        "apps/storefront",
        env.NEXT_DIST_DIR,
        "standalone/apps/storefront",
        env.NEXT_DIST_DIR,
        "static",
      ),
      { recursive: true },
    );
    if (existsSync("public"))
      cpSync("public", join(env.NEXT_DIST_DIR, "standalone/public"), {
        recursive: true,
      });
  }
  const server = start(
    standalone
      ? [join(env.NEXT_DIST_DIR, "standalone/server.cjs")]
      : [
          "node_modules/next/dist/bin/next",
          production ? "start" : "dev",
          "--port",
          "3102",
        ],
    true,
    { PORT: "3102", HOSTNAME: "127.0.0.1" },
  );
  await ready("http://127.0.0.1:3102/api/health/live", server);
  const storefront = start(
    standalone
      ? [
          join(
            "apps/storefront",
            env.NEXT_DIST_DIR,
            "standalone/apps/storefront/server.js",
          ),
        ]
      : [
          "node_modules/next/dist/bin/next",
          "start",
          "apps/storefront",
          "--port",
          "3103",
        ],
    true,
    { PORT: "3103", HOSTNAME: "127.0.0.1" },
  );
  await ready(env.APP_URL + "/en", storefront);
  const testTarget =
    testArguments.length > 0
      ? testArguments
      : [
          "tests/browser/cross-service-storefront.spec.ts",
          "tests/browser/cross-service-i18n.spec.ts",
          "tests/browser/cross-service-sitemap.spec.ts",
          "tests/browser/storefront-journey-updates.spec.ts",
        ];
  await completed(
    start([
      "node_modules/@playwright/test/cli.js",
      "test",
      "--output=test-results/storefront",
      ...testTarget,
    ]),
  );
  if (measure) {
    console.log(
      JSON.stringify(
        {
          metric:
            "Production Next process RSS after synthetic browser journeys",
          platform: process.platform,
          runtime: standalone ? "standalone" : "Next CLI",
          nodeVersion: process.version,
          workload: testTarget,
          services: measureFixtureResources([
            { service: "backend", pid: server.pid },
            { service: "storefront", pid: storefront.pid },
          ]),
        },
        null,
        2,
      ),
    );
    await completed(start(["scripts/measure-storefront-bundle.mjs"]));
  }
} catch (error) {
  console.error(
    error ?? "Browser infrastructure failed; check ports 55449, 3102 and 3103.",
  );
  exitCode = 1;
} finally {
  try {
    await stop();
  } catch (error) {
    console.error("Test cleanup failed:", error);
    exitCode = 1;
  }
}
process.exit(exitCode);

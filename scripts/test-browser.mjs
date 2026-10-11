import { fixtureDirectory } from "./fixture-directory.mjs";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import postgres from "postgres";
import EmbeddedPostgres from "embedded-postgres";

// A dedicated synthetic cluster, database and Next cache. Never use the app DB.
const fixture = fixtureDirectory("browser");
const databaseDir = fixture.path;
const pg = new EmbeddedPostgres({
  databaseDir,
  port: 55439,
  user: "postgres",
  password: "postgres",
  persistent: true,
  onLog: () => {},
  onError: console.error,
});
const database = "supastore_cuj_" + Date.now();
const production = process.argv.includes("--production");
const testArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--production");
const env = {
  ...process.env,
  NEXT_DIST_DIR: ".next-cuj/" + database,
  NEXT_TSCONFIG: ".tsconfig-cuj.json",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55439/" + database,
  APP_URL: "http://localhost:3100",
  BETTER_AUTH_URL: "http://localhost:3100",
  PLAYWRIGHT_BASE_URL: "http://localhost:3100",
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
  TEST_STORAGE_PORT: "9009",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "25259",
  SMTP_SECURE: "false",
  SMTP_REQUIRE_TLS: "false",
  SMTP_FROM: "synthetic@example.test",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  NODE_ENV: production ? "production" : "development",
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
function start(args) {
  const child = spawn(process.execPath, args, {
    env,
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
      ["-D", databaseDir, "-p", "55439"],
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
    "postgresql://postgres:postgres@127.0.0.1:55439/postgres",
  );
  try {
    await admin.unsafe(
      `CREATE DATABASE "${database}" WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
  } finally {
    await admin.end();
  }
  writeFileSync(env.NEXT_TSCONFIG, readFileSync("tsconfig.json"));
  const mail = start(["scripts/test-mail.mjs"]);
  await ready("http://127.0.0.1:9010", mail);
  await completed(
    start(["node_modules/tsx/dist/cli.mjs", "scripts/seed-demo.ts"]),
  );
  start(["scripts/test-storage.mjs"]);
  if (production)
    await completed(start(["node_modules/next/dist/bin/next", "build"]));
  const server = start([
    "node_modules/next/dist/bin/next",
    production ? "start" : "dev",
    "--port",
    "3100",
  ]);
  await ready(env.APP_URL + "/api/health/live", server);
  await completed(
    start(["node_modules/@playwright/test/cli.js", "test", ...testArguments]),
  );
} catch (error) {
  console.error(
    error ?? "Browser infrastructure failed; check ports 55439, 3100 and 9009.",
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

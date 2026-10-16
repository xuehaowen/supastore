import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import EmbeddedPostgres from "embedded-postgres";

// Dedicated to integration tests; never attach to the developer's database.
const databaseDir = "./.test-integration-postgres";
// Below Windows' dynamic port range, which Docker/Hyper-V may reserve.
const port = 25438;
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/supastore_test`;
const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password: "postgres",
  persistent: true,
  onLog: () => {},
  onError: console.error,
});
const completed = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Test process exited with ${code}`)),
    );
  });
let pgCtl, databaseProcess, child;
let started = false;
let exitCode = 0;
async function stop() {
  if (child && child.exitCode === null) child.kill();
  if (!started) return;
  started = false;
  if (pgCtl)
    await completed(
      spawn(pgCtl, ["-D", databaseDir, "-m", "fast", "-w", "stop"], {
        stdio: "inherit",
        windowsHide: true,
      }),
    );
  else await pg.stop();
}
process.once("SIGINT", () => void stop().finally(() => process.exit(130)));
process.once("SIGTERM", () => void stop().finally(() => process.exit(143)));
try {
  if (!existsSync(`${databaseDir}/PG_VERSION`)) await pg.initialise();
  if (process.platform === "win32") {
    const require = createRequire(import.meta.url);
    const embeddedRequire = createRequire(require.resolve("embedded-postgres"));
    const binaries = await import(
      pathToFileURL(embeddedRequire.resolve("@embedded-postgres/windows-x64"))
        .href
    );
    pgCtl = binaries.pg_ctl;
    databaseProcess = spawn(
      binaries.postgres,
      ["-D", databaseDir, "-p", String(port), "-h", "127.0.0.1"],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    await new Promise((resolve, reject) => {
      let startupDiagnostics = "";
      const timer = setTimeout(
        () => reject(new Error("Integration database startup timed out")),
        30000,
      );
      databaseProcess.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      databaseProcess.once("exit", (code) => {
        clearTimeout(timer);
        reject(
          new Error(
            `Integration database exited with ${code}: ${startupDiagnostics}`,
          ),
        );
      });
      databaseProcess.stderr.on("data", (data) => {
        startupDiagnostics = (startupDiagnostics + String(data)).slice(-8000);
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
  started = true;
  const admin = postgres(
    `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
  );
  try {
    if (
      !(await admin`select 1 from pg_database where datname='supastore_test'`)
        .length
    )
      await admin.unsafe(
        "CREATE DATABASE supastore_test WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'",
      );
  } finally {
    await admin.end();
  }
  child = spawn(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      ...(process.argv.length > 2
        ? process.argv.slice(2)
        : ["tests/integration"]),
      "--no-file-parallelism",
    ],
    {
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        TRANSLATION_TEST_DATABASE_URL: databaseUrl,
        DISABLE_OUTBOUND_DELIVERY: "false",
        EMAIL_PROVIDER: "nodemailer",
        SMS_PROVIDER: "disabled",
        PHONE_VERIFICATION_PROVIDER: "disabled",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1",
        SMTP_SECURE: "false",
        SMTP_REQUIRE_TLS: "false",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
      },
    },
  );
  await completed(child);
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  try {
    await stop();
  } catch (error) {
    console.error(error);
    exitCode = 1;
  }
  if (databaseProcess && databaseProcess.exitCode === null)
    databaseProcess.kill();
}
process.exit(exitCode);

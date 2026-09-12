import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = "./.test-postgres";
const port = 55432;
const database = "supastore_test";
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  onLog: () => {},
  onError: console.error,
});

if (!existsSync(`${databaseDir}/PG_VERSION`)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase(database);
} catch (error) {
  if (!String(error).includes("already exists")) throw error;
}

const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${database}`;
const command = process.platform === "win32" ? "node.exe" : "node";
const child = spawn(
  command,
  ["node_modules/vitest/vitest.mjs", "run", "tests/integration", "--no-file-parallelism"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      TRANSLATION_TEST_DATABASE_URL: databaseUrl,
    },
  },
);

const stopPostgres = async () => {
  await Promise.race([
    pg.stop(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
};

const stop = async (code = 1) => {
  if (!child.killed) child.kill();
  await stopPostgres();
  process.exit(code);
};

process.once("SIGINT", () => void stop(130));
process.once("SIGTERM", () => void stop(143));
child.once("exit", async (code, signal) => {
  await stopPostgres();
  process.exit(signal ? 1 : code ?? 1);
});

import postgres from "postgres";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function databaseUrl(connection, name) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error(
      "Use 1–63 lowercase letters, digits or underscores, starting with a letter or underscore.",
    );
  }
  if (["postgres", "template0", "template1"].includes(name)) {
    throw new Error("Choose a dedicated app database, such as supastore_dev.");
  }
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Expected a PostgreSQL connection URL.");
  }
  url.pathname = `/${name}`;
  return url.toString();
}

export async function createDatabase(sql, name) {
  try {
    await sql`CREATE DATABASE ${sql(name)} WITH TEMPLATE template0
      ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`;
    return true;
  } catch (error) {
    if (error.code === "42P04") return false;
    throw error;
  }
}

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const envPath = resolve(root, ".env");
  process.loadEnvFile(envPath);
  const connection =
    process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connection)
    throw new Error(
      "Set DATABASE_URL or MIGRATION_DATABASE_URL in .env first.",
    );
  let name = process.argv[2];
  if (!name) {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      name = (await prompt.question("Database name: ")).trim();
    } finally {
      prompt.close();
    }
  }
  const migrationUrl = databaseUrl(connection, name);
  const adminUrl = new URL(migrationUrl);
  adminUrl.pathname = "/postgres";
  const sql = postgres(adminUrl.toString(), { max: 1, connect_timeout: 10 });
  console.log(
    `Initializing ${name} on ${adminUrl.hostname}:${adminUrl.port || "5432"}…`,
  );
  try {
    console.log(
      (await createDatabase(sql, name))
        ? "Database created."
        : "Database already exists; keeping existing data.",
    );
  } finally {
    await sql.end();
  }
  const env = {
    ...process.env,
    DATABASE_URL: migrationUrl,
    MIGRATION_DATABASE_URL: migrationUrl,
    DEMO_SEED: "true",
    DEMO_OWNER_PASSWORD:
      process.env.DEMO_OWNER_PASSWORD || "AdminSetupSecret123!",
    EMAIL_PROVIDER: "disabled",
    SMS_PROVIDER: "disabled",
    PHONE_VERIFICATION_PROVIDER: "disabled",
    DISABLE_OUTBOUND_DELIVERY: "true",
    ENABLE_OUTBOX_WORKER: "false",
  };
  for (const args of [
    ["scripts/migrate.mjs"],
    ["--import", "tsx", "scripts/seed-demo.ts"],
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      throw new Error(
        "Database initialization stopped. Fix the migration or seed error above, then rerun db:init.",
      );
    }
  }
  console.log(`Database ${name} ready. .env was left unchanged.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    const messages = {
      "28P01":
        "PostgreSQL authentication failed. Check your administrator credentials.",
      42501:
        "The configured PostgreSQL user needs permission to create databases.",
      ECONNREFUSED:
        "PostgreSQL is unavailable. Start your local PostgreSQL service first.",
      CONNECTION_CLOSED:
        "PostgreSQL is unavailable. Check your local PostgreSQL connection.",
    };
    console.error(
      messages[error.code] ||
        (error instanceof AggregateError
          ? "PostgreSQL connection failed."
          : error.message),
    );
    process.exitCode = 1;
  });
}

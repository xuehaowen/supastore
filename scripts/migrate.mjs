import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { provisionRuntimeRole } from "./runtime-role.mjs";
import { reportDatabase } from "./database-settings.mjs";
// Local pnpm invocation reads .env; deployed environments supply explicit values.
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const migrationUrl =
  process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!migrationUrl) throw new Error("DATABASE_URL is required for migrations");
const client = postgres(migrationUrl, {
  max: 1,
  connect_timeout: 10,
});
try {
  await reportDatabase(client);
  await migrate(drizzle(client), {
    migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
  });
  if (process.env.APP_DATABASE_USER || process.env.APP_DATABASE_PASSWORD) {
    await provisionRuntimeRole(client, {
      user: process.env.APP_DATABASE_USER || "",
      password: process.env.APP_DATABASE_PASSWORD || "",
    });
  }
  console.log("Migrations applied successfully");
} finally {
  await client.end();
}

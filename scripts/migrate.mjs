import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for migrations");
const client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
try {
  await migrate(drizzle(client), { migrationsFolder: "src/infrastructure/db/migrations" });
  console.log("Migrations applied successfully");
} finally { await client.end(); }

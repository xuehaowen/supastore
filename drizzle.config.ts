import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./apps/backend/src/infrastructure/db/schema/index.ts",
  out: "./apps/backend/src/infrastructure/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.MIGRATION_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/supastore",
  },
  strict: true,
  verbose: true,
});

import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "@/infrastructure/db";
import { provisionRuntimeRole } from "../../scripts/runtime-role.mjs";

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.endsWith("/supastore_test"))
    throw new Error(
      "Runtime role tests require the isolated integration database",
    );
  await migrate(db, { migrationsFolder: "src/infrastructure/db/migrations" });
  // A failing permission regression can create its specifically named fixture.
  await queryClient.unsafe(
    "DROP SCHEMA IF EXISTS runtime_should_not_create CASCADE",
  );
});
afterAll(async () => {
  await queryClient.end();
});

it("allows application reads but denies schema changes and migration history", async () => {
  await provisionRuntimeRole(queryClient, {
    user: "supastore_test_runtime",
    password: "synthetic-test-password",
  });
  await queryClient.unsafe(
    "GRANT CREATE ON DATABASE supastore_test TO supastore_test_runtime; GRANT USAGE ON SCHEMA drizzle TO supastore_test_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO supastore_test_runtime",
  );
  await provisionRuntimeRole(queryClient, {
    user: "supastore_test_runtime",
    password: "synthetic-test-password",
  });
  await queryClient.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE supastore_test_runtime");
    await expect(
      tx.unsafe("SELECT id FROM carts LIMIT 1"),
    ).resolves.toBeDefined();
    await tx.unsafe(
      "INSERT INTO carts (guest_session_id) VALUES ('runtime-permission-fixture')",
    );
    await tx.unsafe(
      "DELETE FROM carts WHERE guest_session_id = 'runtime-permission-fixture'",
    );
  });
  for (const statement of [
    "CREATE SCHEMA runtime_should_not_create",
    "CREATE TABLE public.runtime_should_not_create (id integer)",
    "ALTER TABLE public.carts ADD COLUMN runtime_should_not_alter integer",
    "SELECT * FROM drizzle.__drizzle_migrations",
  ]) {
    await expect(
      queryClient.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE supastore_test_runtime");
        await tx.unsafe(statement);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  }
  await expect(
    provisionRuntimeRole(queryClient, {
      user: "postgres",
      password: "synthetic-test-password",
    }),
  ).rejects.toThrow("migration role");
});

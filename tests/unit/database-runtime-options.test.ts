import { expect, it } from "vitest";
import { runtimeDatabaseOptions } from "@/infrastructure/db/runtime-options";

it("accepts explicit bounded database budgets", () => {
  expect(
    runtimeDatabaseOptions({
      DB_POOL_MAX: "3",
      DB_STATEMENT_TIMEOUT_MS: "60000",
      DB_LOCK_TIMEOUT_MS: "1000",
    }),
  ).toMatchObject({
    max: 3,
    connection: { statement_timeout: 60000, lock_timeout: 1000 },
  });
});
it.each([
  { DB_POOL_MAX: "21" },
  { DB_STATEMENT_TIMEOUT_MS: "0" },
  { DB_LOCK_TIMEOUT_MS: "1e3" },
  { DB_STATEMENT_TIMEOUT_MS: "1000", DB_LOCK_TIMEOUT_MS: "2000" },
])("rejects unsafe database budgets %o", (env) => {
  expect(() => runtimeDatabaseOptions(env)).toThrow();
});

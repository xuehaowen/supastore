import { describe, expect, it, vi } from "vitest";
import { createDatabase, databaseUrl } from "../../scripts/init-db.mjs";

describe("local database initialization", () => {
  it("changes only the database while retaining credentials and connection options", () => {
    const url = new URL(
      databaseUrl(
        "postgresql://admin:p%40ss@localhost:8111/old?sslmode=disable",
        "supastore_dev",
      ),
    );
    expect(url.pathname).toBe("/supastore_dev");
    expect(url.password).toBe("p%40ss");
    expect(url.port).toBe("8111");
    expect(url.search).toBe("?sslmode=disable");
  });

  it.each([
    "",
    "postgres",
    "template0",
    "template1",
    "x; DROP DATABASE postgres",
    "a".repeat(64),
  ])("rejects unsafe or shared database name %s", (name) => {
    expect(() =>
      databaseUrl("postgresql://localhost/postgres", name),
    ).toThrow();
  });

  it("quotes the database identifier and creates it outside a transaction", async () => {
    const identifier = {};
    const sql = vi.fn((...args: unknown[]) =>
      typeof args[0] === "string" ? identifier : Promise.resolve(),
    );
    expect(await createDatabase(sql, "supastore_dev")).toBe(true);
    expect(sql.mock.calls[0]).toEqual(["supastore_dev"]);
    expect(sql.mock.calls[1][1]).toBe(identifier);
  });

  it("preserves an existing database and propagates other database errors", async () => {
    const sql = (code: string) =>
      vi.fn((...args: unknown[]) =>
        typeof args[0] === "string" ? {} : Promise.reject({ code }),
      );
    expect(await createDatabase(sql("42P04"), "supastore_dev")).toBe(false);
    await expect(createDatabase(sql("42501"), "supastore_dev")).rejects.toEqual(
      { code: "42501" },
    );
  });
});

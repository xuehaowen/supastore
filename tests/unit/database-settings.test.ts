import { describe, expect, it } from "vitest";
import { inspectDatabase } from "../../scripts/database-settings.mjs";
import {
  toolConnection,
  migrateLocale,
} from "../../scripts/migrate-database-locale.mjs";

describe("database configuration", () => {
  it.each([
    [
      {
        version: 180001,
        encoding: "UTF8",
        provider: "b",
        locale: "PG_UNICODE_FAST",
      },
      true,
      true,
    ],
    [
      {
        version: 180001,
        encoding: "UTF8",
        provider: "c",
        locale: "C",
        collate: "C",
        ctype: "C",
      },
      true,
      false,
    ],
    [
      { version: 170000, encoding: "UTF8", provider: "c", locale: null },
      false,
      false,
    ],
    [
      { version: 180001, encoding: "LATIN1", provider: "c", locale: null },
      false,
      false,
    ],
  ])(
    "reports compatibility without rejecting existing UTF8 C databases",
    async (settings, compatible, recommended) => {
      const result = await inspectDatabase(async () => [settings]);
      expect(result.compatible).toBe(compatible);
      expect(result.recommended).toBe(recommended);
    },
  );
  it("keeps passwords out of PostgreSQL tool arguments", () => {
    const result = toolConnection(
      "postgresql://admin:p%40ss@localhost:8111/source?sslmode=require",
    );
    expect(result.password).toBe("p@ss");
    expect(result.url).not.toContain("p%40ss");
    expect(result.url).toContain("sslmode=require");
  });
  it("refuses source replacement and unacknowledged writes before connecting", async () => {
    const connection = "postgresql://localhost/source";
    await expect(
      migrateLocale({ connection, target: "source" }),
    ).rejects.toThrow("differ");
    await expect(
      migrateLocale({ connection, target: "new_database", apply: true }),
    ).rejects.toThrow("writers");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createDatabase } from "../../scripts/init-db.mjs";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("database Unicode defaults", () => {
  const name = `unicode_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;
  beforeAll(async () => {
    admin = postgres(server!, { onnotice: () => {} });
    await createDatabase(admin, name);
    const url = new URL(server!);
    url.pathname = `/${name}`;
    client = postgres(url.toString(), { onnotice: () => {} });
  });
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it("creates a UTF8 database with the builtin Unicode locale", async () => {
    const [settings] = await client`
      select pg_encoding_to_char(encoding) as encoding,
        datlocprovider as provider, datlocale as locale
      from pg_database where datname = current_database()`;
    expect(settings).toEqual({
      encoding: "UTF8",
      provider: "b",
      locale: "PG_UNICODE_FAST",
    });
    expect(await createDatabase(admin, name)).toBe(false);
  });

  it("round trips multilingual text and supports Unicode case-insensitive search", async () => {
    await client`create table unicode_products(title text not null)`;
    const title = "École 日本語 中文 🛍️";
    await client`insert into unicode_products(title) values (${title})`;
    const rows =
      await client`select title from unicode_products where title ilike ${"%éCOLE%"}`;
    expect(rows.map((row) => row.title)).toEqual([title]);
    const [casing] =
      await client`select upper('straße') as upper, lower('ÉCOLE') as lower`;
    expect(casing).toEqual({ upper: "STRASSE", lower: "école" });
  });
});

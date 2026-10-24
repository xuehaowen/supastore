import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
const active = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/infrastructure/db", () => ({
  get db() {
    return active.db;
  },
}));
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { inspectDatabase } from "../../scripts/database-settings.mjs";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server).each(["C", "PG_UNICODE_FAST"])(
  "storefront Unicode search on %s",
  (locale) => {
    const name = `search_${randomUUID().replaceAll("-", "")}`;
    let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
    beforeAll(async () => {
      admin = postgres(server!, { onnotice: () => {} });
      await admin.unsafe(
        locale === "C"
          ? `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER libc LC_COLLATE 'C' LC_CTYPE 'C'`
          : `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'PG_UNICODE_FAST'`,
      );
      const url = new URL(server!);
      url.pathname = `/${name}`;
      client = postgres(url.toString(), { onnotice: () => {} });
      const db = drizzle(client);
      active.db = db;
      await migrate(db, {
        migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
      });
      await client`insert into store_settings(store_name,default_locale) values('Unicode shop','en')`;
      await client`insert into products(handle,title,description,is_published,created_at) values
      ('cafe','Café ÉCOLE','Crème brûlée',true,'2026-01-01'),
      ('decomposed',${"Cafe\u0301 noir"},'',true,'2026-01-02'),
      ('zh','中文茶具','茶',true,'2026-01-03'),
      ('ja','日本語の器','',true,'2026-01-04'),
      ('emoji','Shopping 🛍️ bag','',true,'2026-01-05'),
      ('translated','Original mug','',true,'2026-01-06'),
      ('draft','Café secret','',false,'2026-01-07'),
      ('wildcard','100% cotton_under','',true,'2026-01-08')`;
      await client`insert into product_translations(product_id,locale,title)
      select id,'zh','咖啡馬克杯' from products where handle='translated'`;
      await client`insert into product_translations(product_id,locale,title)
      select id,'fr','Tasse de café' from products where handle='translated'`;
    }, 30000);
    afterAll(async () => {
      if (client) await client.end();
      if (admin) {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
      }
    });
    it.each([
      ["cafe", "cafe"],
      ["ÉCOLE", "cafe"],
      ["creme brulee", "cafe"],
      ["中文", "zh"],
      ["日本語", "ja"],
      ["🛍️", "emoji"],
      ["Cafe\u0301", "decomposed"],
      ["100%", "wildcard"],
      ["cotton_", "wildcard"],
    ])("finds %s without changing displayed text", async (search, handle) => {
      const result = await listProducts({ search, locale: "en" });
      expect(result.items.some((item) => item.handle === handle)).toBe(true);
      expect(result.items.some((item) => item.handle === "draft")).toBe(false);
      if (handle === "cafe")
        expect(result.items.find((item) => item.handle === handle)?.title).toBe(
          "Café ÉCOLE",
        );
    });
    it("searches only the selected and fallback translations", async () => {
      expect(
        (await listProducts({ search: "咖啡", locale: "zh" })).items.map(
          (p) => p.handle,
        ),
      ).toContain("translated");
      expect(
        (
          await listProducts({ search: "tasse de cafe", locale: "fr" })
        ).items.map((p) => p.handle),
      ).toContain("translated");
      expect(
        (await listProducts({ search: "tasse", locale: "en" })).items.map(
          (p) => p.handle,
        ),
      ).not.toContain("translated");
    });
    it("treats wildcard-only queries literally", async () => {
      expect(
        (await listProducts({ search: "%" })).items.map((p) => p.handle),
      ).toEqual(["wildcard"]);
      expect(
        (await listProducts({ search: "_" })).items.map((p) => p.handle),
      ).toEqual(["wildcard"]);
    });
    it("keeps product pagination stable across multilingual titles", async () => {
      const first = await listProducts({
        pageSize: 3,
        page: 1,
        sort: "newest",
      });
      const second = await listProducts({
        pageSize: 3,
        page: 2,
        sort: "newest",
      });
      expect(first.items.map((p) => p.handle)).toEqual([
        "wildcard",
        "translated",
        "emoji",
      ]);
      expect(second.items.map((p) => p.handle)).toEqual([
        "ja",
        "zh",
        "decomposed",
      ]);
      expect(
        new Set([...first.items, ...second.items].map((p) => p.id)).size,
      ).toBe(6);
    });
    it("reports the actual server configuration", async () => {
      const report = await inspectDatabase(client);
      expect(report.compatible).toBe(true);
      expect(report.locale).toBe(locale);
      expect(report.recommended).toBe(locale === "PG_UNICODE_FAST");
    });
    it("indexes normalized search expressions", async () => {
      await client`set enable_seqscan=off`;
      const [row] =
        await client`explain (format json) select id from products where public.storefront_search_text(title) like '%cafe%'`;
      expect(JSON.stringify(row)).toContain("idx_products_unicode_title");
      await client`reset enable_seqscan`;
    });
  },
);

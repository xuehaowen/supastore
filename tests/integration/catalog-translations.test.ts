import { vi } from "vitest";
import { getProduct } from "@/application/use-cases/catalog/get-product";
import { getCart } from "@/application/use-cases/cart/get-cart";
import {
  localizeCategories,
  localizeVariants,
  translatedField,
} from "@/application/use-cases/catalog/localize";
const activeDatabase = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/infrastructure/db", () => ({
  get db() {
    return activeDatabase.current;
  },
}));
import * as schema from "../../apps/backend/src/infrastructure/db/schema/index";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import {
  seedCatalogTranslations,
  type TranslationSeed,
} from "../../scripts/seed-catalog-translations";
import { describe, it, expect } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { randomUUID } from "node:crypto";

// Use an explicit test server; each run creates and drops its own database.
const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("catalog translation database constraints", () => {
  it("migrates and enforces translation ownership, uniqueness and cleanup", async () => {
    const admin = postgres(server!, { max: 1 });
    const name = `translation_test_${randomUUID().replaceAll("-", "")}`;
    let client: ReturnType<typeof postgres> | undefined;
    try {
      await admin.unsafe(
        `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
      );
      const url = new URL(server!);
      url.pathname = `/${name}`;
      client = postgres(url.toString(), { max: 1, onnotice: () => {} });
      const db = drizzle(client, { schema });
      activeDatabase.current = db;
      const options = {
        migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
      };
      await migrate(db, options);
      await migrate(db, options);
      const [product] =
        await client`INSERT INTO products (handle,title) VALUES ('test','Test') RETURNING id`;
      const [variant] =
        await client`INSERT INTO product_variants (product_id,sku,title,price_cents) VALUES (${product.id},'test','Test',100) RETURNING id`;
      const [category] =
        await client`INSERT INTO categories (slug,name) VALUES ('test','Test') RETURNING id`;
      const [attribute] =
        await client`INSERT INTO attributes (code,name) VALUES ('color','Color') RETURNING id`;
      const [other] =
        await client`INSERT INTO attributes (code,name) VALUES ('size','Size') RETURNING id`;
      const [value] =
        await client`INSERT INTO attribute_values (attribute_id,code,label) VALUES (${attribute.id},'red','Red') RETURNING id`;
      const cases = [
        ["category_translations", "category_id", category.id, "name"],
        ["attribute_translations", "attribute_id", attribute.id, "name"],
        [
          "attribute_value_translations",
          "attribute_value_id",
          value.id,
          "label",
        ],
        ["variant_translations", "variant_id", variant.id, "title"],
      ];
      for (const [table, owner, id, field] of cases) {
        const insert = `INSERT INTO ${table} (${owner},locale,${field}) VALUES ($1,$2,$3)`;
        await client.unsafe(insert, [id, "zh", "Translated"]);
        await client.unsafe(insert, [id, "en", "Original"]);
        await expect(
          client.unsafe(insert, [id, "zh", "Duplicate"]),
        ).rejects.toMatchObject({ code: "23505" });
        await expect(
          client.unsafe(insert, [randomUUID(), "zh", "Orphan"]),
        ).rejects.toMatchObject({ code: "23503" });
      }
      await expect(
        client`INSERT INTO variant_attribute_values VALUES (${variant.id},${other.id},${value.id})`,
      ).rejects.toMatchObject({ code: "23503" });
      await client`INSERT INTO variant_attribute_values VALUES (${variant.id},${attribute.id},${value.id})`;
      await expect(
        client`INSERT INTO variant_attribute_values VALUES (${variant.id},${attribute.id},${value.id})`,
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        client`DELETE FROM attribute_values WHERE id=${value.id}`,
      ).rejects.toMatchObject({
        code: expect.stringMatching(/^(23001|23503)$/),
        constraint_name: expect.stringContaining(
          "variant_attribute_values_attribute_id_attribute_value_id",
        ),
      });
      await client`DELETE FROM product_variants WHERE id=${variant.id}`;
      expect(await client`SELECT * FROM variant_attribute_values`).toHaveLength(
        0,
      );
      await client`DELETE FROM attributes WHERE id=${attribute.id}`;
      await client`DELETE FROM categories WHERE id=${category.id}`;
      for (const [table] of cases)
        expect(await client.unsafe(`SELECT * FROM ${table}`)).toHaveLength(0);
      const yaml = (file: string) =>
        load(readFileSync("scripts/seed-data/" + file, "utf8"));
      const seed = {
        attributes: yaml("attributes.yaml"),
        categories: yaml("categories.yaml"),
        products: yaml("products.yaml"),
      } as TranslationSeed;
      for (const category of seed.categories) {
        await client`INSERT INTO categories (slug,name) VALUES (${category.slug},${category.slug})`;
      }
      for (const product of seed.products) {
        const [row] =
          await client`INSERT INTO products (handle,title) VALUES (${product.handle},${product.handle}) RETURNING id`;
        for (const variant of product.variants) {
          await client`INSERT INTO product_variants (product_id,sku,title,price_cents) VALUES (${row.id},${variant.sku},${variant.sku},100)`;
        }
      }
      await seedCatalogTranslations(db, seed);
      const before =
        await client`SELECT id FROM variant_translations ORDER BY id`;
      await seedCatalogTranslations(db, seed);
      expect(
        await client`SELECT id FROM variant_translations ORDER BY id`,
      ).toEqual(before);
      expect(before).toHaveLength(5);
      expect(await client`SELECT * FROM category_translations`).toHaveLength(3);
      expect(await client`SELECT * FROM attribute_translations`).toHaveLength(
        2,
      );
      expect(
        await client`SELECT * FROM attribute_value_translations`,
      ).toHaveLength(4);
      expect(await client`SELECT * FROM variant_attribute_values`).toHaveLength(
        8,
      );
      await client`INSERT INTO store_settings (store_name,default_locale) VALUES ('Test','zh')`;
      const [shirt] =
        await client`SELECT id FROM products WHERE handle='everyday-shirt'`;
      const [apparel] =
        await client`SELECT id FROM categories WHERE slug='apparel'`;
      await client`INSERT INTO product_categories VALUES (${shirt.id},${apparel.id})`;
      await client`INSERT INTO product_translations (product_id,locale,title) VALUES (${shirt.id},'zh','衬衫')`;
      const detail = await getProduct({
        handle: "everyday-shirt",
        locale: "zh",
      });
      expect(detail.title).toBe("衬衫");
      expect(detail.categories[0].name).toBe("服装");
      const small = detail.variants.find(
        (v) => v.sku === "everyday-shirt-natural-s",
      )!;
      expect(small.title).toBe("原色 / 小码");
      expect(small.localizedAttributes.map((a) => [a.name, a.label])).toEqual([
        ["颜色", "原色"],
        ["尺码", "小码"],
      ]);
      expect(
        (await getProduct({ handle: "everyday-shirt", locale: "fr" })).variants,
      ).toEqual(detail.variants);
      expect((await getProduct({ handle: "everyday-shirt" })).title).toBe(
        detail.title,
      );
      await client`INSERT INTO variant_translations (variant_id,locale,title) VALUES (${small.id},'fr','French custom')`;
      await client`INSERT INTO category_translations (category_id,locale,name) VALUES (${apparel.id},'fr','French category')`;
      const french = await getProduct({
        handle: "everyday-shirt",
        locale: "fr",
      });
      expect(french.categories[0].name).toBe("French category");
      expect(french.variants.find((v) => v.id === small.id)!.title).toBe(
        "French custom",
      );
      expect(
        french.variants.find((v) => v.id === small.id)!.localizedAttributes,
      ).toEqual(small.localizedAttributes);
      await client`DELETE FROM variant_translations WHERE locale='fr'`;
      await client`DELETE FROM category_translations WHERE locale='fr'`;
      const [cart] =
        await client`INSERT INTO carts (guest_session_id) VALUES ('translation-test') RETURNING id`;
      await client`INSERT INTO cart_items (cart_id,variant_id,quantity) VALUES (${cart.id},${small.id},2)`;
      const basket = await getCart({
        guestSessionId: "translation-test",
        locale: "fr",
      });
      expect(basket!.items[0]).toMatchObject({
        title: small.title,
        productTitle: detail.title,
        variantId: small.id,
        priceCents: 100,
        lineTotalCents: 200,
      });
      const translatedCategories = await localizeCategories(
        [{ id: apparel.id, name: "Apparel" }],
        "fr",
        "en",
        db,
      );
      expect(translatedCategories[0].name).toBe("Apparel");
      await client`DELETE FROM variant_translations WHERE variant_id=${small.id}`;
      expect(
        (
          await getProduct({ handle: "everyday-shirt", locale: "zh" })
        ).variants.find((v) => v.id === small.id)!.title,
      ).toBe("原色 / 小码");
      const english = await localizeVariants(
        [{ id: small.id, title: "Original" }],
        "en",
        "en",
        db,
      );
      expect(english[0].title).toBe("Natural / S");
      expect(english[0].localizedAttributes[0].name).toBe("Color");
      expect(
        (
          await localizeVariants(
            [{ id: randomUUID(), title: "Legacy" }],
            "zh",
            "en",
            db,
          )
        )[0],
      ).toMatchObject({ title: "Legacy", localizedAttributes: [] });
      expect(
        translatedField(
          [{ locale: "zh", title: "" }],
          "title",
          "zh",
          "en",
          "Original",
        ),
      ).toBe("");
      // Restore the demo rows before verifying seed edits and rollback.
      await seedCatalogTranslations(db, seed);
      seed.products[0].variants[0].translations = [
        { locale: "zh", title: "Updated" },
      ];
      await seedCatalogTranslations(db, seed);
      expect(
        await client`SELECT * FROM variant_translations WHERE title='Updated'`,
      ).toHaveLength(1);
      seed.attributes[0].name = "Should roll back";
      seed.products[0].variants[0].attributeValues = { color: "unknown" };
      await expect(seedCatalogTranslations(db, seed)).rejects.toThrow(
        "Unknown seed attribute value",
      );
      expect(
        await client`SELECT * FROM attributes WHERE name='Should roll back'`,
      ).toHaveLength(0);
    } finally {
      if (client) await client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
      await admin.end();
    }
  }, 60000);
});

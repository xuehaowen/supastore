import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
const storage = vi.hoisted(() => ({ deleteCatalogAsset: vi.fn() }));
vi.mock("@/infrastructure/storage", () => storage);
const active = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/infrastructure/db", () => ({
  get db() {
    return active.db;
  },
}));
import * as schema from "@/infrastructure/db/schema";
import { updateStoreSettings } from "@/application/use-cases/store/update-store-settings";

import { cleanupCatalogMedia } from "@/application/use-cases/catalog/cleanup-catalog-media";
import { listProducts } from "@/application/use-cases/catalog/list-products";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("storefront hero settings", () => {
  const name = `hero_test_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
  beforeAll(async () => {
    admin = postgres(server!);
    await admin.unsafe(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'PG_UNICODE_FAST'`,
    );
    const url = new URL(server!);
    url.pathname = `/${name}`;
    client = postgres(url.toString(), { onnotice: () => {} });
    const db = drizzle(client, { schema });
    active.db = db;
    await migrate(db, {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await client`insert into store_settings(store_name) values('Hero test')`;
    await client`insert into staff_memberships(user_id,email,role) values('owner','owner@example.test','owner'),('staff','staff@example.test','staff')`;
  }, 30000);
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
  it("migrates existing stores with a null hero and permits clearing without changing quote version", async () => {
    const [before] =
      await client`select storefront_hero,quote_version from store_settings`;
    expect(before!.storefront_hero).toBeNull();
    await updateStoreSettings({ staffUserId: "owner", storefrontHero: null });
    const [after] = await client`select quote_version from store_settings`;
    expect(after!.quote_version).toBe(before!.quote_version);
  });
  it("requires owner privileges and rejects arbitrary or private asset keys", async () => {
    await expect(
      updateStoreSettings({ staffUserId: "staff", storefrontHero: null }),
    ).rejects.toThrow(/Owner privileges/);
    await expect(
      updateStoreSettings({
        staffUserId: "owner",
        storefrontHero: { imageKey: "private/payment-proof.jpg" },
      }),
    ).rejects.toThrow(/published product or collection/);
  });
  it("accepts a published catalog asset, persists copy, and records an audit", async () => {
    const [p] =
      await client`insert into products(handle,title,is_published) values('hero','Hero',true) returning id`;
    await client`insert into product_images(product_id,s3_key) values(${p!.id},'catalog/hero.jpg')`;
    const hero = {
      imageKey: "catalog/hero.jpg",
      en: {
        heading: "Useful objects",
        body: "For daily use",
        imageAlt: "A cup",
      },
    };
    await updateStoreSettings({ staffUserId: "owner", storefrontHero: hero });
    const [saved] = await client`select storefront_hero from store_settings`;
    expect(saved!.storefront_hero).toEqual(hero);
    const [audit] =
      await client`select details from audit_records where action='store.settings_updated' order by created_at desc limit 1`;
    expect(audit!.details.storefrontHero).toEqual(hero);
    await client`update products set is_published=false where id=${p!.id}`;
    await expect(
      updateStoreSettings({ staffUserId: "owner", storefrontHero: hero }),
    ).resolves.toMatchObject({ storefrontHero: hero });
  });
  it("retains a hero after its catalog reference is removed and cleans it after clearing", async () => {
    const [product] = await client`select id from products where handle='hero'`;
    const [upload] =
      await client`insert into catalog_media_uploads(entity_id,entity_type,actor_id,s3_key,status,expires_at) values(${product.id},'product','owner','catalog/hero.jpg','pending',now()-interval '1 minute') returning id`;
    await client`delete from product_images where s3_key='catalog/hero.jpg'`;
    await cleanupCatalogMedia(upload.id);
    expect(storage.deleteCatalogAsset).not.toHaveBeenCalled();
    const [retained] =
      await client`select status from catalog_media_uploads where id=${upload.id}`;
    expect(retained.status).toBe("attached");
    await updateStoreSettings({ staffUserId: "owner", storefrontHero: null });
    await cleanupCatalogMedia(upload.id);
    expect(storage.deleteCatalogAsset).toHaveBeenCalledWith("catalog/hero.jpg");
  });
  it("validates published featured selections and only promotes them in the homepage order", async () => {
    const [older] =
      await client`insert into products(handle,title,is_published,created_at) values('featured','Featured',true,now()-interval '1 day') returning id`;
    const [newer] =
      await client`insert into products(handle,title,is_published) values('latest','Latest',true) returning id`;
    const [draft] =
      await client`insert into products(handle,title,is_published) values('draft','Draft',false) returning id`;
    const [collection] =
      await client`insert into product_collections(handle,title,is_published) values('chosen','Chosen',true) returning id`;
    await expect(
      updateStoreSettings({
        staffUserId: "owner",
        storefrontHero: { imageKey: null, featuredProductIds: [draft.id] },
      }),
    ).rejects.toThrow(/published products/);
    await expect(
      updateStoreSettings({
        staffUserId: "owner",
        storefrontHero: { imageKey: null, featuredCollectionIds: [older.id] },
      }),
    ).rejects.toThrow(/published collections/);
    await client`insert into product_images(product_id,s3_key,sort_order) values(${older.id},'catalog/front.jpg',0),(${older.id},'catalog/back.jpg',1)`;
    await updateStoreSettings({
      staffUserId: "owner",
      storefrontHero: {
        imageKey: null,
        imagePosition: "bottom",
        featuredProductIds: [older.id],
        featuredCollectionIds: [collection.id],
      },
    });
    const home = await listProducts({
      locale: "en",
      featuredFirst: true,
      sort: "newest",
    });
    expect(home.items[0]).toMatchObject({
      id: older.id,
      coverImageKey: "catalog/front.jpg",
      previewImageKey: "catalog/back.jpg",
    });
    expect(
      (
        await listProducts({
          featuredFirst: true,
          sort: "newest",
          pageSize: 1,
          page: 2,
        })
      ).items[0]?.id,
    ).toBe(newer.id);
    expect(
      (await listProducts({ locale: "en", sort: "newest" })).items[0]?.id,
    ).toBe(newer.id);
    await client`update products set is_published=false where id=${older.id}`;
    expect(
      (await listProducts({ featuredFirst: true })).items.map(
        (item) => item.id,
      ),
    ).not.toContain(older.id);
  });
});

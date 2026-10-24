import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
vi.mock("@/infrastructure/auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import * as schema from "@/infrastructure/db/schema";
import { changeCatalogPlacement } from "@/application/use-cases/catalog/change-catalog-placement";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { listAdminProducts } from "@/application/use-cases/catalog/list-admin-products";
import { updateProduct } from "@/application/use-cases/catalog/update-product";
import {
  catalogPage,
  collectionPage,
  collectionsPage,
} from "@/infrastructure/http/customer-page-data";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("mixed catalog filtering and scoped placement", () => {
  const name = `placement_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
  let old: string,
    fresh: string,
    tote: string,
    cups: string,
    summer: string,
    other: string;
  beforeAll(async () => {
    admin = postgres(server!, { onnotice: () => {} });
    await admin.unsafe(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'PG_UNICODE_FAST'`,
    );
    const url = new URL(server!);
    url.pathname = `/${name}`;
    client = postgres(url.toString(), { onnotice: () => {} });
    active.db = drizzle(client, { schema });
    await migrate(drizzle(client), {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await client`insert into store_settings(store_name) values('Placement shop')`;
    await client`insert into staff_memberships(user_id,email,role) values('owner','owner@example.test','owner'),('staff','staff@example.test','staff')`;
    const products =
      await client`insert into products(handle,title,is_published,created_at) values ('old','Blue cup',true,'2026-01-01'),('fresh','New blue cup',true,'2026-01-03'),('tote','Blue tote',true,'2026-01-02'),('draft','Secret blue cup',false,'2025-01-01') returning id,handle`;
    old = products.find((row) => row.handle === "old")!.id;
    fresh = products.find((row) => row.handle === "fresh")!.id;
    tote = products.find((row) => row.handle === "tote")!.id;
    const variants =
      await client`insert into product_variants(product_id,sku,title,price_cents) select id,handle,title,case when handle='old' then 1000 when handle='fresh' then 2000 else 500 end from products returning id,product_id`;
    [{ id: cups }] =
      await client`insert into categories(name,slug) values('Cups','cups') returning id`;
    await client`insert into product_categories(product_id,category_id) select id,${cups} from products where handle<>'tote'`;
    [{ id: summer }] =
      await client`insert into product_collections(handle,title,is_published) values('summer','Summer',true) returning id`;
    [{ id: other }] =
      await client`insert into product_collections(handle,title,is_published) values('other','Other',true) returning id`;
    await client`insert into product_collection_memberships(collection_id,product_id) select ${summer},id from products`;
    await client`insert into product_collection_memberships(collection_id,product_id) values(${other},${old})`;
    const [secret] =
      await client`insert into product_collections(handle,title,is_published) values('secret','Secret',false) returning id`;
    await client`insert into product_collection_memberships(collection_id,product_id) values(${secret!.id},${old})`;
    const [attribute] =
      await client`insert into attributes(code,name,kind) values('color','Color','variant') returning id`;
    const [blue] =
      await client`insert into attribute_values(attribute_id,code,label) values(${attribute!.id},'blue','Blue') returning id`;
    await client`insert into product_options(product_id,attribute_id) values(${old},${attribute!.id})`;
    await client`insert into variant_attribute_values(variant_id,attribute_id,attribute_value_id) values(${variants.find((row) => row.product_id === old)!.id},${attribute!.id},${blue!.id})`;
  }, 30000);
  beforeEach(async () => {
    await client`update products set sort_order=null,is_pinned=false`;
    await client`update product_categories set sort_order=null,is_pinned=false`;
    await client`update product_collection_memberships set sort_order=0,is_pinned=false`;
    await client`update categories set sort_order=0,is_pinned=false`;
    await client`update product_collections set sort_order=0,is_pinned=false`;
  });
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
  const place = (
    input: Partial<Parameters<typeof changeCatalogPlacement>[0]> & {
      id: string;
    },
  ) =>
    changeCatalogPlacement({
      staffUserId: "owner",
      kind: "product",
      operation: "pin",
      expectedPosition: "auto",
      expectedPinned: "false",
      ...input,
    });
  const handles = async (input: Parameters<typeof listProducts>[0] = {}) =>
    (await listProducts(input)).items.map((row) => row.handle);

  it("intersects collection, category, text and available variant options and excludes unpublished products", async () => {
    expect(
      await handles({
        collectionHandle: "summer",
        categorySlug: "cups",
        search: "blue",
        optionValues: [{ attribute: "color", value: "blue" }],
      }),
    ).toEqual(["old"]);
    expect(
      await handles({ collectionHandle: "secret", categorySlug: "cups" }),
    ).toEqual([]);
    await place({ id: tote });
    expect(
      await handles({ collectionHandle: "other", categorySlug: "cups" }),
    ).toEqual(["old"]);
  });
  it("isolates global, category and collection pins; collection placement wins in an intersection", async () => {
    await place({ id: old });
    await place({ id: fresh, kind: "category-product", scopeId: cups });
    await place({
      id: tote,
      kind: "collection-product",
      scopeId: summer,
      expectedPosition: 0,
    });
    expect((await handles())[0]).toBe("old");
    expect((await handles({ categorySlug: "cups" }))[0]).toBe("fresh");
    expect((await handles({ collectionHandle: "summer" }))[0]).toBe("tote");
    await place({
      id: old,
      kind: "collection-product",
      scopeId: summer,
      operation: "save",
      expectedPosition: 0,
      position: 1,
    });
    await place({
      id: fresh,
      kind: "collection-product",
      scopeId: summer,
      operation: "save",
      expectedPosition: 0,
      position: 2,
    });
    expect(
      await handles({ categorySlug: "cups", collectionHandle: "summer" }),
    ).toEqual(["old", "fresh"]);
  });
  it("honors explicit price and newest sorts above pinning and homepage featured order", async () => {
    await place({ id: old });
    await client`update store_settings set storefront_hero=${JSON.stringify({ featuredProductIds: [old] })}::jsonb`;
    expect(await handles({ sort: "price-low", featuredFirst: true })).toEqual([
      "tote",
      "old",
      "fresh",
    ]);
    expect(await handles({ sort: "price-high" })).toEqual([
      "fresh",
      "old",
      "tote",
    ]);
    expect(await handles({ sort: "newest", featuredFirst: true })).toEqual([
      "fresh",
      "tote",
      "old",
    ]);
    expect((await handles({ featuredFirst: true }))[0]).toBe("old");
  });
  it("moves across automatic positions, persists numeric placement, and supports unpin and reset", async () => {
    await place({ id: old, operation: "top" });
    expect((await handles())[0]).toBe("old");
    await place({ id: old, operation: "down", expectedPosition: 0 });
    expect(await handles()).toEqual(["fresh", "old", "tote"]);
    await place({ id: old, operation: "up", expectedPosition: 1 });
    expect((await handles())[0]).toBe("old");
    await place({ id: old, expectedPosition: 0 });
    await place({
      id: old,
      operation: "unpin",
      expectedPosition: 0,
      expectedPinned: "true",
    });
    await place({
      id: old,
      operation: "save",
      position: "",
      expectedPosition: 0,
    });
    expect(await handles()).toEqual(["fresh", "tote", "old"]);
  });
  it("moves within category siblings and within a collection without touching other scopes", async () => {
    await place({
      id: old,
      kind: "collection-product",
      scopeId: summer,
      operation: "top",
      expectedPosition: 0,
    });
    expect((await handles({ collectionHandle: "summer" }))[0]).toBe("old");
    expect(
      (
        await client`select sort_order from product_collection_memberships where collection_id=${other} and product_id=${old}`
      )[0]!.sort_order,
    ).toBe(0);
    const [root] =
      await client`insert into categories(name,slug,sort_order) values('Z root','z-root',50) returning id`;
    const [child] =
      await client`insert into categories(name,slug,parent_id,sort_order) values('Child','child',${root!.id},90) returning id`;
    await place({
      id: root!.id,
      kind: "category",
      operation: "top",
      expectedPosition: 50,
    });
    expect(
      (
        await client`select id from categories where parent_id is null order by sort_order,slug`
      )[0]!.id,
    ).toBe(root!.id);
    expect(
      (
        await client`select sort_order from categories where id=${child!.id}`
      )[0]!.sort_order,
    ).toBe(90);
  });
  it("requires owner privileges, rejects stale forms, and validates scope membership", async () => {
    await expect(place({ id: old, staffUserId: "staff" })).rejects.toThrow(
      /Owner privileges/,
    );
    await place({ id: old });
    await expect(place({ id: old })).rejects.toThrow(/changed/);
    await expect(
      place({ id: tote, kind: "category-product", scopeId: cups }),
    ).rejects.toThrow(/scope/);
    await expect(
      place({ id: fresh, operation: "save", position: -1 }),
    ).rejects.toThrow(/Position/);
    await expect(place({ id: fresh, operation: "injected" })).rejects.toThrow(
      /Placement action/,
    );
  });
  it("keeps pagination stable and shows scoped placement in the admin index", async () => {
    await place({ id: old, kind: "category-product", scopeId: cups });
    const data = await listAdminProducts("owner", {
      category: cups,
      status: "published",
      sort: "storefront",
    });
    expect(data.rows[0]).toMatchObject({
      product: { id: old },
      pinned: true,
      position: null,
    });
    const first = await listProducts({
      categorySlug: "cups",
      pageSize: 1,
      page: 1,
    });
    const second = await listProducts({
      categorySlug: "cups",
      pageSize: 1,
      page: 2,
    });
    expect(first.total).toBe(2);
    expect(first.items[0]!.id).toBe(old);
    expect(second.items[0]!.id).toBe(fresh);
  });
  it("audits placement without changing financial revisions", async () => {
    const [settings] = await client`select quote_version from store_settings`;
    const [product] =
      await client`select quote_version from products where id=${old}`;
    await place({ id: old });
    expect((await client`select quote_version from store_settings`)[0]).toEqual(
      settings,
    );
    expect(
      (await client`select quote_version from products where id=${old}`)[0],
    ).toEqual(product);
    expect(
      (
        await client`select details from audit_records where entity_id=${old} and action='storefront.placement_changed' order by created_at desc limit 1`
      )[0]!.details.operation,
    ).toBe("pin");
  });
  it("preserves retained category placements when editing product content", async () => {
    await place({ id: old, kind: "category-product", scopeId: cups });
    const [product] =
      await client`select quote_version from products where id=${old}`;
    const variants =
      await client`select id,title,sku,price_cents from product_variants where product_id=${old}`;
    await updateProduct({
      staffUserId: "owner",
      productId: old,
      quoteVersion: product!.quote_version,
      title: "Blue cup",
      handle: "old",
      description: "Edited description",
      categoryIds: [cups],
      variants: variants.map((row) => ({
        id: row.id,
        title: row.title,
        sku: row.sku,
        priceCents: row.price_cents,
      })),
      images: [],
    });
    expect(
      (
        await client`select is_pinned,sort_order from product_categories where category_id=${cups} and product_id=${old}`
      )[0],
    ).toEqual({ is_pinned: true, sort_order: null });
  });
  it("publishes combined catalog and collection results, including a selected collection beyond the navigation limit", async () => {
    for (let index = 0; index < 26; index++)
      await client`insert into product_collections(handle,title,is_published) values(${`aaa-${index}`},'Other edit',true)`;
    await client`insert into collection_translations(collection_id,locale,title,description) values(${summer},'zh','夏季','季节精选')`;
    const query = {
      collection: "summer",
      category: "cups",
      q: "Blue",
      options: ["color:blue"],
      sort: "price-high",
    };
    const catalog = await catalogPage("zh", query);
    expect(catalog.result.items.map((row) => row.id)).toEqual([old]);
    expect(catalog.collections.some((row) => row.id === summer)).toBe(true);
    expect(
      catalog.collectionTitles.find((row) => row.collectionId === summer)
        ?.title,
    ).toBe("夏季");
    expect(
      (await collectionPage("zh", "summer", query)).result.items.map(
        (row) => row.id,
      ),
    ).toEqual([old]);
    await expect(catalogPage("en", { collection: "secret" })).rejects.toThrow(
      /Collection not found/,
    );
    await expect(catalogPage("en", { collection: "missing" })).rejects.toThrow(
      /Collection not found/,
    );
    await client`update store_settings set default_locale='zh'`;
    try {
      const fallback = await catalogPage("en", { collection: "summer" });
      expect(
        fallback.collectionTitles.find((row) => row.collectionId === summer)
          ?.title,
      ).toBe((await collectionPage("en", "summer")).translated?.title);
    } finally {
      await client`update store_settings set default_locale='en'`;
    }
  });
  it("publishes pinned navigation first while retaining category hierarchy", async () => {
    await place({ id: other, kind: "collection", expectedPosition: 0 });
    await place({ id: cups, kind: "category", expectedPosition: 0 });
    const directory = await collectionsPage("en", {});
    expect(directory.collections[0]!.id).toBe(other);
    const catalog = await catalogPage("en");
    expect(catalog.collections[0]!.id).toBe(other);
    expect(catalog.groups[0]!.id).toBe(cups);
  });
});

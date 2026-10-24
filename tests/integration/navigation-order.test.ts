import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
const active = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/infrastructure/db", () => ({
  get db() {
    return active.db;
  },
}));
import * as schema from "@/infrastructure/db/schema";
import { setNavigationPosition } from "@/application/use-cases/catalog/set-navigation-position";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("storefront navigation ordering", () => {
  const name = `nav_order_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
  let collectionId: string, categoryId: string;
  beforeAll(async () => {
    admin = postgres(server!);
    await admin.unsafe(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    const url = new URL(server!);
    url.pathname = `/${name}`;
    client = postgres(url.toString(), { onnotice: () => {} });
    const db = drizzle(client, { schema });
    active.db = db;
    const folder = "apps/backend/src/infrastructure/db/migrations";
    mkdirSync(".tmp-cuj", { recursive: true });
    const previous = mkdtempSync(".tmp-cuj/navigation-upgrade-");
    try {
      const journal = JSON.parse(
        readFileSync(join(folder, "meta/_journal.json"), "utf8"),
      );
      journal.entries = journal.entries.filter(
        (entry: { idx: number }) => entry.idx <= 46,
      );
      mkdirSync(join(previous, "meta"));
      writeFileSync(
        join(previous, "meta/_journal.json"),
        JSON.stringify(journal),
      );
      for (const entry of journal.entries)
        cpSync(
          join(folder, `${entry.tag}.sql`),
          join(previous, `${entry.tag}.sql`),
        );
      await migrate(db, { migrationsFolder: previous });
      await client`insert into product_collections(handle,title,is_published) values('zebra','Zebra',true),('apple','Apple',true),('draft','Middle draft',false)`;
      await migrate(db, { migrationsFolder: folder });
    } finally {
      if (!resolve(previous).startsWith(resolve(".tmp-cuj") + sep))
        throw new Error("Fixture escaped workspace");
      rmSync(previous, { recursive: true, force: true });
    }
    await client`insert into store_settings(store_name) values('Navigation fixture')`;
    await client`insert into staff_memberships(user_id,email,role) values('owner','owner@example.test','owner'),('staff','staff@example.test','staff')`;
    [{ id: collectionId }] =
      await client`select id from product_collections where handle='zebra'`;
    [{ id: categoryId }] =
      await client`insert into categories(name,slug) values('Category','category') returning id`;
  }, 30000);
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
  it("upgrades existing collections in their previous alphabetical order and is idempotent", async () => {
    const rows =
      await client`select title,sort_order from product_collections order by sort_order`;
    expect(rows.map((row) => row.title)).toEqual([
      "Apple",
      "Middle draft",
      "Zebra",
    ]);
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    expect(
      await client`select title,sort_order from product_collections order by sort_order`,
    ).toEqual(rows);
  });
  it("requires owner privileges and validates positions", async () => {
    await expect(
      setNavigationPosition({
        staffUserId: "staff",
        kind: "collection",
        id: collectionId,
        position: 10,
        expectedPosition: 3,
      }),
    ).rejects.toThrow(/Owner privileges/);
    for (const position of [-1, "1.5", "", 1000001])
      await expect(
        setNavigationPosition({
          staffUserId: "owner",
          kind: "category",
          id: categoryId,
          position,
          expectedPosition: 0,
        }),
      ).rejects.toThrow(/Storefront order/);
  });
  it("persists and audits order without changing checkout settings or homepage featured choices", async () => {
    await client`update store_settings set storefront_hero=${JSON.stringify({ featuredCollectionIds: [collectionId] })}::jsonb`;
    const [before] =
      await client`select quote_version,storefront_hero from store_settings`;
    await setNavigationPosition({
      staffUserId: "owner",
      kind: "collection",
      id: collectionId,
      position: 0,
      expectedPosition: 3,
    });
    const [collection] =
      await client`select sort_order,revision from product_collections where id=${collectionId}`;
    expect(collection).toMatchObject({ sort_order: 0, revision: 2 });
    expect(
      (
        await client`select quote_version,storefront_hero from store_settings`
      )[0],
    ).toEqual(before);
    expect(
      (
        await client`select details from audit_records where entity_id=${collectionId} and action='storefront.order_changed'`
      )[0]!.details,
    ).toEqual({ previousPosition: 3, position: 0 });
    await expect(
      setNavigationPosition({
        staffUserId: "owner",
        kind: "collection",
        id: collectionId,
        position: 5,
        expectedPosition: 3,
      }),
    ).rejects.toThrow(/changed/);
  });
  it("rejects one of two competing category updates instead of silently overwriting", async () => {
    const results = await Promise.allSettled(
      [10, 20].map((position) =>
        setNavigationPosition({
          staffUserId: "owner",
          kind: "category",
          id: categoryId,
          position,
          expectedPosition: 0,
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
});

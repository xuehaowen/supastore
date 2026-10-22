import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
const active = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/infrastructure/db", () => ({
  get db() {
    return active.db;
  },
}));
import * as schema from "@/infrastructure/db/schema";
import { loadGenerationOptions } from "@/application/use-cases/catalog/generate-variants";
import { saveAttribute } from "@/application/use-cases/catalog/manage-attributes";
import { changeSpecification } from "@/application/use-cases/catalog/manage-specifications";
import { importProductsCsv } from "@/application/use-cases/catalog/import-products-csv";
import {
  customerDirectoryFilter,
  excludeStaffContacts,
} from "@/application/queries/customer-directory";
import { getCombinedSitemapStatic } from "@/application/queries/combined-sitemap";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("catalog concepts and customer directory", () => {
  const name = `separation_test_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof postgres>,
    client: ReturnType<typeof postgres>,
    database: ReturnType<typeof drizzle<typeof schema>>;
  const owner = "separation-owner";
  beforeAll(async () => {
    admin = postgres(server!);
    await admin.unsafe(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    const url = new URL(server!);
    url.pathname = `/${name}`;
    client = postgres(url.toString(), { max: 4, onnotice: () => {} });
    database = drizzle(client, { schema });
    active.db = database;
    await migrate(database, {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await client`insert into staff_memberships(user_id,email,role) values(${owner},'owner@example.test','owner'),('inactive-staff','staff@example.test','staff')`;
    await client`update staff_memberships set is_active=false where user_id='inactive-staff'`;
    await client`insert into store_settings(store_name) values('Test store')`;
  }, 30000);
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
  it("preserves shared legacy specifications and variant identities in the migration", async () => {
    const [p] =
      await client`insert into products(handle,title) values('legacy','Legacy') returning id`;
    const [a] =
      await client`insert into attributes(code,name) values('legacy-size','Size') returning id`;
    const [v] =
      await client`insert into attribute_values(attribute_id,code,label) values(${a.id},'small','Small') returning id`;
    await client`insert into product_options(product_id,attribute_id) values(${p.id},${a.id})`;
    await client`insert into product_specifications(product_id,attribute_id,attribute_value_id) values(${p.id},${a.id},${v.id})`;
    await client`insert into attribute_translations(attribute_id,locale,name) values(${a.id},'zh','尺寸')`;
    await client`insert into attribute_value_translations(attribute_value_id,locale,label) values(${v.id},'zh','小')`;
    await client`alter table attributes drop column kind`;
    await client.unsafe(
      readFileSync(
        "apps/backend/src/infrastructure/db/migrations/0045_attribute_purpose.sql",
        "utf8",
      ),
    );
    const [original] =
      await client`select kind from attributes where id=${a.id}`;
    expect(original.kind).toBe("variant");
    const [copy] =
      await client`select a.id,a.code,a.kind,av.label,t.name,vt.label as translated_label from product_specifications s join attributes a on a.id=s.attribute_id join attribute_values av on av.id=s.attribute_value_id join attribute_translations t on t.attribute_id=a.id join attribute_value_translations vt on vt.attribute_value_id=av.id where s.product_id=${p.id}`;
    expect(copy).toMatchObject({
      kind: "descriptive",
      label: "Small",
      name: "尺寸",
      translated_label: "小",
    });
    expect(copy.id).not.toBe(a.id);
    expect(copy.code.length).toBeLessThanOrEqual(40);
    await expect(
      saveAttribute({
        staffUserId: owner,
        id: copy.id,
        code: copy.code,
        label: "Descriptive size",
        archived: false,
      }),
    ).resolves.toBe(copy.id);
    expect(
      (
        await client`select attribute_id from product_options where product_id=${p.id}`
      )[0].attribute_id,
    ).toBe(a.id);
  });
  it("excludes staff by linked identity and normalized email, including guests and inactive staff", async () => {
    await client`insert into "user"(id,name,email) values(${owner},'Owner','new-owner@example.test')`;
    await client`insert into customers(name,email,auth_user_id) values('Linked owner','changed@example.test',${owner})`;
    await client`insert into customers(name,email) values('Legacy owner',' OWNER@example.test '),('Inactive staff','staff@example.test'),('Shopper','shopper@example.test')`;
    const rows = await database
      .select({ email: schema.customers.email })
      .from(schema.customers)
      .where(customerDirectoryFilter());
    expect(rows).toEqual([{ email: "shopper@example.test" }]);
    const guests = await database.execute(
      sql`select email from (values ('OWNER@example.test'), ('shopper@example.test')) as guest(email) where ${excludeStaffContacts(sql`guest.email`)}`,
    );
    expect([...guests]).toEqual([{ email: "shopper@example.test" }]);
  });
  it("rejects descriptive values for generation and CSV imports, but permits specifications", async () => {
    const a = await saveAttribute({
      staffUserId: owner,
      code: "sugar-free",
      label: "Sugar-free",
      archived: false,
    });
    await saveAttribute({
      staffUserId: owner,
      attributeId: a,
      code: "yes",
      label: "Yes",
      archived: false,
    });
    const [v] =
      await client`select id from attribute_values where attribute_id=${a}`;
    await expect(
      database.transaction((tx) => loadGenerationOptions(tx, [v.id])),
    ).rejects.toThrow("Descriptive attributes");
    const row = {
      handle: "sugar-free-test",
      sku: "SUGAR-FREE",
      productTitle: "Food",
      variantTitle: "Food",
      description: "",
      priceCents: 100,
      isAvailable: true,
      isPublished: true,
      optionValues: { "sugar-free": "yes" },
    };
    await expect(
      importProductsCsv({ staffUserId: owner, rows: [row] }),
    ).rejects.toThrow("Descriptive attribute");
    expect(
      await client`select id from products where handle='sugar-free-test'`,
    ).toHaveLength(0);
    const [p] =
      await client`insert into products(handle,title) values('food','Food') returning id`;
    await changeSpecification({
      staffUserId: owner,
      productId: p.id,
      valueId: v.id,
      revision: 1,
      remove: false,
      sortOrder: 0,
    });
    expect(
      await client`select * from product_specifications where product_id=${p.id}`,
    ).toHaveLength(1);
    const option = await saveAttribute({
      staffUserId: owner,
      code: "flavor",
      label: "Flavor",
      kind: "variant",
      archived: false,
    });
    await saveAttribute({
      staffUserId: owner,
      attributeId: option,
      code: "vanilla",
      label: "Vanilla",
      archived: false,
    });
    const [ov] =
      await client`select id from attribute_values where attribute_id=${option}`;
    await expect(
      database.transaction((tx) => loadGenerationOptions(tx, [ov.id])),
    ).resolves.toHaveLength(1);
    await expect(
      changeSpecification({
        staffUserId: owner,
        productId: p.id,
        valueId: ov.id,
        revision: 2,
        remove: false,
        sortOrder: 0,
      }),
    ).rejects.toThrow("Variant options");
    await expect(
      saveAttribute({
        staffUserId: owner,
        id: a,
        code: "sugar-free",
        label: "Sugar-free",
        kind: "variant",
        archived: false,
      }),
    ).rejects.toThrow("purpose is permanent");
  });
  it("includes all common pages in the sitemap before content is authored", async () => {
    const entries = await getCombinedSitemapStatic();
    for (const key of [
      "about",
      "support",
      "shipping",
      "returns",
      "privacy",
      "terms",
    ])
      expect(entries).toContainEqual({
        path: `/pages/${key}`,
        locales: ["en", "zh"],
      });
  });
});

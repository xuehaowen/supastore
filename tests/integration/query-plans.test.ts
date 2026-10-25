import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("bounded order-list query plans", () => {
  const database = `plans_test_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
  beforeAll(async () => {
    admin = postgres(server!);
    await admin.unsafe(
      `CREATE DATABASE "${database}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'PG_UNICODE_FAST'`,
    );
    const url = new URL(server!);
    url.pathname = `/${database}`;
    client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await migrate(drizzle(client), {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await client`create temporary table fixture as select n,gen_random_uuid() as cart_id,gen_random_uuid() as quote_id from generate_series(1,10000) n`;
    await client`insert into carts(id,guest_session_id) select cart_id,'plan-' || n from fixture`;
    await client`insert into quotes(id,cart_id,cart_revision,merchandise_subtotal_cents,shipping_cents,exclusive_tax_cents,inclusive_tax_cents,total_payable_cents,items_snapshot,shipping_snapshot,expires_at) select quote_id,cart_id,1,100,0,0,0,100,'[]','{}',now()+interval '1 day' from fixture`;
    await client`insert into orders(source_cart_id,quote_id,reference_code,lifecycle_status,purchase_total_cents,guest_email,guest_name,shipping_address_snapshot,created_at) select cart_id,quote_id,'PLAN-' || n,case when n%100=0 then 'completed' else 'unpaid' end,100,'plan@example.test','Plan','{}',now()- n * interval '1 minute' from fixture`;
    await client`analyze orders`;
  }, 30000);
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
    }
  });
  it.each([
    [
      "all orders",
      "select * from orders order by created_at desc,id desc limit 51",
      "idx_order_admin_history",
    ],
    [
      "status-filtered orders",
      "select * from orders where lifecycle_status='completed' order by created_at desc,id desc limit 51",
      "idx_order_status_history",
    ],
  ])("avoids a full sort for %s", async (_label, query, index) => {
    const [row] = await client.unsafe(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
    );
    const plan = JSON.stringify(row!["QUERY PLAN"]);
    expect(plan).toContain(index);
    expect(plan).not.toContain('"Node Type":"Sort"');
  });
  it("prebuilds valid indexes concurrently and preserves them on migration adoption", async () => {
    await client`drop index concurrently idx_order_admin_history`;
    await client`drop index concurrently idx_order_status_history`;
    const prebuild = readFileSync("scripts/order-query-indexes.sql", "utf8");
    for (const statement of prebuild.split(";").filter((part) => part.trim()))
      await client.unsafe(statement);
    const before =
      await client`select c.oid,c.relname,i.indisvalid from pg_class c join pg_index i on i.indexrelid=c.oid where c.relname in ('idx_order_admin_history','idx_order_status_history') order by c.relname`;
    expect(before).toHaveLength(2);
    expect(before.every((row) => row.indisvalid)).toBe(true);
    const migration = readFileSync(
      "apps/backend/src/infrastructure/db/migrations/0037_order_queue_indexes.sql",
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      await client.unsafe(statement);
    const after =
      await client`select c.oid,c.relname,i.indisvalid from pg_class c join pg_index i on i.indexrelid=c.oid where c.relname in ('idx_order_admin_history','idx_order_status_history') order by c.relname`;
    expect(after).toEqual(before);
  });
});

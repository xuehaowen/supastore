import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fixtureProfile } from "../../scripts/benchmark/protocol";
import { seedRepresentativeFixture } from "../../scripts/benchmark/seed";
import { validateOrderReferenceCode } from "@/domain/money/reference-code";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;
const name = `supastore_cuj_${Date.now()}`;
const token = randomUUID();
let admin: ReturnType<typeof postgres>;
let client: ReturnType<typeof postgres>;
let url: string;
beforeAll(async () => {
  if (!server)
    throw new Error("Use scripts/test-integration.mjs for this fixture test.");
  const connection = new URL(server);
  if (
    connection.hostname !== "127.0.0.1" ||
    connection.port !== "25438" ||
    connection.pathname !== "/supastore_test"
  )
    throw new Error("Isolated integration cluster required.");
  admin = postgres(server, { onnotice: () => {} });
  await admin.unsafe(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
  );
  connection.pathname = `/${name}`;
  url = connection.href;
  client = postgres(url, { onnotice: () => {} });
  await migrate(drizzle(client), {
    migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
  });
  await client`create table benchmark_fixture_ownership(token uuid primary key)`;
  await client`insert into benchmark_fixture_ownership values(${token})`;
}, 30000);
afterAll(async () => {
  if (client) await client.end();
  if (admin) {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});

it("refuses the wrong owner before changing any application records", async () => {
  await expect(
    seedRepresentativeFixture(
      url,
      randomUUID(),
      fixtureProfile(100, "mixed", true, true),
    ),
  ).rejects.toThrow("Benchmark fixture ownership mismatch");
  expect((await client`select count(*)::int as n from products`)[0]!.n).toBe(0);
});

it("seeds the standard catalog and established history with balanced ledgers", async () => {
  const report = await seedRepresentativeFixture(
    url,
    token,
    fixtureProfile(1000, "mixed", true, true),
  );
  expect(report.counts).toMatchObject({
    products: 1000,
    variants: 4000,
    images: 2000,
    orders: 10000,
    categories: 8,
    attributes: 2,
  });
  expect(report.images).toHaveLength(2);
  const [balance] = await client`
    select
      (select count(*)::int from orders o where purchase_total_cents <> (select sum(line_total_cents) from order_items i where i.order_id=o.id)) as wrong_totals,
      (select count(*)::int from variant_stock s where on_hand <> (select coalesce(sum(delta),0) from stock_movements m where m.variant_id=s.variant_id) or reserved<>0) as wrong_stock,
      (select count(*)::int from orders o where lifecycle_status='completed' and purchase_total_cents <> (select coalesce(sum(funded_amount_cents),0) from confirmation_funding f where f.order_id=o.id)) as wrong_funding,
      (select count(*)::int from stock_reservations where status='active' or (status='consumed' and consumed_quantity<>quantity)) as wrong_reservations,
      (select count(*)::int from carts where converted_order_id is null) as unconverted,
      (select count(*)::int from notification_outbox) as notifications`;
  expect(balance).toEqual({
    wrong_totals: 0,
    wrong_stock: 0,
    wrong_funding: 0,
    wrong_reservations: 0,
    unconverted: 0,
    notifications: 0,
  });
  const references =
    await client`select reference_code from orders order by reference_code limit 30`;
  expect(
    references.every((row) => validateOrderReferenceCode(row.reference_code)),
  ).toBe(true);
  expect(
    (
      await client`select count(*)::int as n from orders where lifecycle_status='completed'`
    )[0]!.n,
  ).toBe(8000);
  expect(
    (await client`select count(*)::int as n from variant_attribute_values`)[0]!
      .n,
  ).toBe(8000);
  expect(
    (await client`select count(*)::int as n from product_option_values`)[0]!.n,
  ).toBe(4000);
  await expect(
    seedRepresentativeFixture(
      url,
      token,
      fixtureProfile(1000, "mixed", true, true),
    ),
  ).rejects.toThrow("Benchmark fixture must be empty");
}, 60000);

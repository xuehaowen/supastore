import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fixtureProfile } from "../../scripts/benchmark/protocol";
import { seedRepresentativeFixture } from "../../scripts/benchmark/seed";
import { validateOrderReferenceCode } from "@/domain/money/reference-code";
import { buildVariantCombinations } from "@/domain/catalog/variant-combinations";
import { parseCustomerPage } from "@supastore/contracts/customer-page-validation";
import { pages } from "../fixtures/customer-pages";
import { benchmarkImageForKey } from "../../scripts/benchmark/images.mjs";

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
  console.info("BENCHMARK_FIXTURE", JSON.stringify(report));
  const snapshots = await client`select distinct terms_snapshot from orders`;
  for (const row of snapshots) {
    expect
      .soft(() =>
        parseCustomerPage("order", {
          ...pages.order,
          result: {
            ...pages.order.result,
            order: {
              ...pages.order.result.order,
              termsSnapshot: row.terms_snapshot,
            },
          },
        }),
      )
      .not.toThrow();
  }
  const options = await client<
    { id: string; code: string; name: string }[]
  >`select id,code,name from attributes order by sort_order`;
  const values = await client<
    { id: string; attribute_id: string; code: string; label: string }[]
  >`select id,attribute_id,code,label from attribute_values order by sort_order`;
  const combinations = buildVariantCombinations(
    options.map((option) => ({
      ...option,
      values: values.filter((value) => value.attribute_id === option.id),
    })),
    "BENCH",
  );
  const keys =
    await client`select combination_key from product_variants where product_id=(select id from products where handle='benchmark-product-1')`;
  expect
    .soft(new Set(keys.map((row) => row.combination_key)))
    .toEqual(new Set(combinations.map((combination) => combination.key)));
  const [balance] = await client`
    select
      (select count(*)::int from orders o where purchase_total_cents <> (select sum(line_total_cents) from order_items i where i.order_id=o.id)) as wrong_totals,
      (select count(*)::int from variant_stock s where on_hand <> (select coalesce(sum(delta),0) from stock_movements m where m.variant_id=s.variant_id) or reserved<>0) as wrong_stock,
      (select count(*)::int from orders o where lifecycle_status='completed' and purchase_total_cents <> (select coalesce(sum(funded_amount_cents),0) from confirmation_funding f where f.order_id=o.id)) as wrong_funding,
      (select count(*)::int from stock_reservations where status='active' or (status='consumed' and consumed_quantity<>quantity)) as wrong_reservations,
      (select count(*)::int from carts where converted_order_id is null) as unconverted,
      (select count(*)::int from outbox_events) as notifications`;
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

it.each([
  [100, "shipping", false, false],
  [10000, "pickup", false, true],
  [100, "mixed", true, false],
])(
  "verifies %i products / %s / rewards=%s / tracked=%s in a fresh owned database",
  async (products, fulfillment, rewards, tracked) => {
    const profile = fixtureProfile(products, fulfillment, rewards, tracked);
    const isolatedName = `supastore_cuj_${Date.now()}`;
    const isolatedUrl = new URL(url);
    isolatedUrl.pathname = `/${isolatedName}`;
    const isolatedToken = randomUUID();
    let isolated: ReturnType<typeof postgres> | undefined;
    await admin.unsafe(
      `CREATE DATABASE "${isolatedName}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    try {
      isolated = postgres(isolatedUrl.href, { onnotice: () => {} });
      await migrate(drizzle(isolated), {
        migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
      });
      await isolated`create table benchmark_fixture_ownership(token uuid primary key)`;
      await isolated`insert into benchmark_fixture_ownership values(${isolatedToken})`;
      const report = await seedRepresentativeFixture(
        isolatedUrl.href,
        isolatedToken,
        profile,
      );
      console.info("BENCHMARK_FIXTURE", JSON.stringify(report));
      expect(report.counts).toMatchObject({
        products,
        variants: profile.variants,
        images: profile.images,
        orders: 10000,
      });
      const [settings] =
        await isolated`select commerce_policy from store_settings`;
      expect(settings!.commerce_policy).toMatchObject({
        shippingEnabled: fulfillment !== "pickup",
        pickupEnabled: fulfillment !== "shipping",
        rewardsEnabled: rewards,
      });
      const [stock] =
        await isolated`select count(*)::int as variants, count(*) filter(where tracking_enabled)::int as tracked from variant_stock`;
      expect(stock).toEqual({
        variants: profile.variants,
        tracked: tracked ? profile.variants : 0,
      });
      expect(
        (await isolated`select count(*)::int as n from stock_reservations`)[0]!
          .n,
      ).toBe(tracked ? 10000 : 0);
      const [balance] =
        await isolated`select count(*)::int as n from variant_stock s where on_hand <> (select coalesce(sum(delta),0) from stock_movements m where m.variant_id=s.variant_id) or reserved<>0`;
      expect(balance!.n).toBe(0);
      const images = await isolated`select s3_key from product_images`;
      expect(
        images.every((row) =>
          benchmarkImageForKey("/browser-public-fixture/" + row.s3_key),
        ),
      ).toBe(true);
    } finally {
      if (isolated) await isolated.end();
      await admin.unsafe(
        `DROP DATABASE IF EXISTS "${isolatedName}" WITH (FORCE)`,
      );
    }
  },
  90000,
);

it("rolls back the entire seed when a later fixture insert conflicts", async () => {
  const isolatedName = `supastore_cuj_${Date.now()}`;
  const isolatedUrl = new URL(url);
  isolatedUrl.pathname = `/${isolatedName}`;
  const isolatedToken = randomUUID();
  let isolated: ReturnType<typeof postgres> | undefined;
  await admin.unsafe(
    `CREATE DATABASE "${isolatedName}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
  );
  try {
    isolated = postgres(isolatedUrl.href, { onnotice: () => {} });
    await migrate(drizzle(isolated), {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await isolated`create table benchmark_fixture_ownership(token uuid primary key)`;
    await isolated`insert into benchmark_fixture_ownership values(${isolatedToken})`;
    await isolated`insert into categories(slug,name) values('benchmark-category-1','Retain this existing record')`;
    await expect(
      seedRepresentativeFixture(
        isolatedUrl.href,
        isolatedToken,
        fixtureProfile(100, "mixed", true, true),
      ),
    ).rejects.toThrow();
    const [result] =
      await isolated`select (select count(*)::int from store_settings) as settings, (select count(*)::int from payment_accounts) as accounts, (select count(*)::int from products) as products, (select count(*)::int from categories) as categories`;
    expect(result).toEqual({
      settings: 0,
      accounts: 0,
      products: 0,
      categories: 1,
    });
  } finally {
    if (isolated) await isolated.end();
    await admin.unsafe(
      `DROP DATABASE IF EXISTS "${isolatedName}" WITH (FORCE)`,
    );
  }
}, 30000);

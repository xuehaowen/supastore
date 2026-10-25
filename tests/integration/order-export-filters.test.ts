import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { beforeAll, afterAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient as sql } from "@/infrastructure/db";
import {
  streamOrderExportRows,
  streamOrdersCsv,
} from "@/application/use-cases/catalog/export-csv";
import { getAdminOperations } from "@/application/queries/admin-operations";
import type { OrderExportSelection } from "@/domain/catalog/order-export-selection";
import { exportOrdersXlsx } from "@/application/use-cases/catalog/export-orders-xlsx";

const marker = `export-${randomUUID()}`;
const product = randomUUID(),
  variant = randomUUID(),
  location = randomUUID(),
  owner = randomUUID();
const fixtures = Array.from({ length: 103 }, (_, index) => ({
  id: randomUUID(),
  cart: randomUUID(),
  quote: randomUUID(),
  reference: `${marker}-${String(index).padStart(3, "0")}`,
  name: `Buyer ${String(102 - index).padStart(3, "0")}`,
  total: 1000 + index * 11,
  date: `2026-10-${String((index % 28) + 1).padStart(2, "0")}`,
  type: index % 2 ? "shipping" : "pickup",
}));

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.endsWith("/supastore_test"))
    throw new Error("Requires isolated integration database");
  await migrate(db, {
    migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
  });
  await sql`insert into staff_memberships(user_id,email,role) values(${owner},${owner + "@example.test"},'owner')`;
  await sql`insert into products(id,handle,title) values(${product},${marker},'Renamed product')`;
  await sql`insert into product_variants(id,product_id,sku,title,price_cents) values(${variant},${product},${marker},'Renamed variant',9999)`;
  await sql`insert into pickup_location(id,name,address,weekly_schedule) values(${location},${marker},'Current location address','{}')`;
  for (const row of fixtures) {
    await sql`insert into carts(id,guest_session_id) values(${row.cart},${row.cart})`;
    await sql`insert into quotes(id,cart_id,cart_revision,merchandise_subtotal_cents,shipping_cents,exclusive_tax_cents,inclusive_tax_cents,total_payable_cents,items_snapshot,shipping_snapshot,expires_at)
      values(${row.quote},${row.cart},1,${row.total},0,0,0,${row.total},${JSON.stringify([{ variantId: variant, title: "Original cup" }])}::jsonb,'{}',now()+interval '15 minutes')`;
    const terms = {
      currency: "USD",
      precision: 2,
      pickup:
        row.type === "pickup"
          ? {
              locationId: location,
              address: 'Original address, unit "A"',
              date: row.date,
              startTime: "10:00",
              endTime: "11:00",
            }
          : null,
    };
    await sql`insert into orders(id,source_cart_id,quote_id,reference_code,purchase_total_cents,guest_name,guest_email,fulfillment_type,shipping_address_snapshot,terms_snapshot,created_at)
      values(${row.id},${row.cart},${row.quote},${row.reference},${row.total},${row.name},'buyer@example.test',${row.type},'{"address":"1 Main St","region":"CA","postalCode":"90210","country":"US"}',${JSON.stringify(terms)}::jsonb,'2026-09-14 12:00:00.123456+00')`;
    await sql`insert into order_items(order_id,variant_id,quantity,unit_price_cents,line_total_cents,catalog_snapshot)
      values(${row.id},${variant},2,1250,2500,'{"sku":"ORIGINAL-SKU"}')`;
  }
}, 30000);

afterAll(async () => {
  const ids = fixtures.map((row) => row.id),
    carts = fixtures.map((row) => row.cart),
    quotes = fixtures.map((row) => row.quote);
  await sql`delete from order_items where order_id in ${sql(ids)}`;
  await sql`delete from orders where id in ${sql(ids)}`;
  await sql`delete from quotes where id in ${sql(quotes)}`;
  await sql`delete from carts where id in ${sql(carts)}`;
  await sql`delete from product_variants where id=${variant}`;
  await sql`delete from products where id=${product}`;
  await sql`delete from pickup_location where id=${location}`;
  await sql`delete from staff_memberships where user_id=${owner}`;
  await sql.end();
});

async function exported(selection: OrderExportSelection = {}) {
  const result = [];
  for await (const row of streamOrderExportRows({
    search: marker,
    ...selection,
  }))
    result.push(row);
  return result;
}

it("keeps sorted export batches consistent while totals change concurrently", async () => {
  const stream = streamOrderExportRows({
    search: marker,
    sort: "total",
    direction: "asc",
  });
  const results = [];
  try {
    for (let index = 0; index < 100; index++) {
      const row = await stream.next();
      expect(row.done).toBe(false);
      results.push(row.value!);
    }
    await sql`update orders set purchase_total_cents=999999 where id=${fixtures[0]!.id}`;
    await sql`update orders set purchase_total_cents=1 where id=${fixtures[102]!.id}`;
    for await (const row of stream) results.push(row);
    expect(results.map((row) => row.reference_code)).toEqual(
      fixtures.map((row) => row.reference),
    );
    expect(results[0]!.purchase_total).toBe(fixtures[0]!.total / 100);
    expect(results[102]!.purchase_total).toBe(fixtures[102]!.total / 100);
  } finally {
    await stream.return(undefined);
    for (const index of [0, 102])
      await sql`update orders set purchase_total_cents=${fixtures[index]!.total} where id=${fixtures[index]!.id}`;
  }
});

it("releases the export snapshot when the consumer cancels", async () => {
  const idle = async () => {
    const [row] = await sql`select count(*)::int as count from pg_stat_activity
      where datname=current_database() and state='idle in transaction'`;
    return row!.count as number;
  };
  const before = await idle();
  const stream = streamOrderExportRows({ search: marker, sort: "total" });
  try {
    expect((await stream.next()).done).toBe(false);
    expect(await idle()).toBe(before + 1);
  } finally {
    await stream.return(undefined);
  }
  expect(await idle()).toBe(before);
});

it("exports historical items, decimal amounts, pickup details and shipping addresses", async () => {
  const rows = await exported();
  const pickup = rows.find(
    (row) => row.reference_code === fixtures[0]!.reference,
  )!;
  expect(pickup).toMatchObject({
    item_name: "Original cup",
    sku: "ORIGINAL-SKU",
    quantity: 2,
    unit_price: 12.5,
    line_total: 25,
    purchase_total: 10,
    currency: "USD",
    pickup_location: marker,
    pickup_address: 'Original address, unit "A"',
    pickup_date: "2026-10-01",
    pickup_start_time: "10:00",
    pickup_end_time: "11:00",
    shipping_address: "",
  });
  expect(
    rows.find((row) => row.reference_code === fixtures[1]!.reference),
  ).toMatchObject({
    shipping_address: "1 Main St",
    shipping_region: "CA",
    shipping_postal_code: "90210",
    shipping_country: "US",
    pickup_date: "",
  });
  let csv = "";
  for await (const line of streamOrdersCsv({ ids: [fixtures[0]!.id] }))
    csv += line;
  expect(csv).toContain('"Original address, unit ""A"""');
  expect(csv).not.toContain("purchase_total_cents");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await exportOrdersXlsx({ ids: [fixtures[0]!.id] })) as never,
  );
  const sheet = workbook.getWorksheet("Orders")!;
  const columns = sheet.getRow(1).values as string[];
  const cell = (name: string) => sheet.getCell(2, columns.indexOf(name));
  expect(cell("purchase total").value).toBe(10);
  expect(cell("unit price").value).toBe(12.5);
  expect(cell("pickup address").value).toBe('Original address, unit "A"');
  expect(cell("item name").value).toBe("Original cup");
});

it("keeps every item and empty order and respects each order's currency precision", async () => {
  const order = fixtures[0]!.id;
  const extra = randomUUID();
  try {
    await sql`update orders set terms_snapshot=terms_snapshot || '{"currency":"KWD","precision":3}', purchase_total_cents=1255 where id=${order}`;
    await sql`insert into order_items(id,order_id,variant_id,quantity,unit_price_cents,line_total_cents,catalog_snapshot) values(${extra},${order},${variant},1,1255,1255,'{"title":"Second item","sku":"SECOND"}')`;
    const rows = await exported({ ids: [order] });
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (row) => row.purchase_total === 1.255 && row.currency === "KWD",
      ),
    ).toBe(true);
    expect(rows.find((row) => row.sku === "SECOND")).toMatchObject({
      item_name: "Second item",
      unit_price: 1.255,
      line_total: 1.255,
    });
    expect(
      await exported({ ids: [order], minTotal: "1.255", maxTotal: "1.255" }),
    ).toHaveLength(2);
    await sql`delete from order_items where order_id=${order}`;
    const empty = await exported({ ids: [order] });
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({
      quantity: "",
      unit_price: "",
      item_name: "",
      purchase_total: 1.255,
    });
  } finally {
    await sql`delete from order_items where id=${extra}`;
    await sql`update orders set terms_snapshot=terms_snapshot || '{"currency":"USD","precision":2}', purchase_total_cents=${fixtures[0]!.total} where id=${order}`;
    await sql`insert into order_items(order_id,variant_id,quantity,unit_price_cents,line_total_cents,catalog_snapshot) values(${order},${variant},2,1250,2500,'{"sku":"ORIGINAL-SKU"}')`;
  }
});

it.each(["createdAt", "pickupLocation", "pickupTime", "customer", "total"])(
  "sorts %s deterministically across export batches in both directions",
  async (sort) => {
    for (const direction of ["asc", "desc"]) {
      const rows = await exported({ sort, direction });
      const key = (row: (typeof fixtures)[number]) =>
        sort === "total"
          ? row.total
          : sort === "customer"
            ? row.name
            : sort === "pickupLocation"
              ? row.type === "pickup"
                ? marker
                : ""
              : sort === "pickupTime"
                ? row.type === "pickup"
                  ? `${row.date} 10:00`
                  : " "
                : "same";
      const expected = [...fixtures].sort((a, b) => {
        const x = key(a),
          y = key(b);
        const comparison = x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1;
        return direction === "asc" ? comparison : -comparison;
      });
      expect(rows.map((row) => row.reference_code)).toEqual(
        expected.map((row) => row.reference),
      );
    }
  },
);

it("applies combined filters to exports and the paginated order list", async () => {
  const filters = {
    fulfillmentType: "pickup",
    pickupLocation: marker,
    customer: "Buyer",
    pickupFrom: "2026-10-05",
    pickupTo: "2026-10-20",
    pickupTimeFrom: "09:00",
    pickupTimeTo: "10:00",
    createdFrom: "2026-09-14",
    createdTo: "2026-09-14",
    minTotal: "12.50",
    maxTotal: "18.50",
    sort: "total",
    direction: "asc",
  };
  const expected = fixtures
    .filter(
      (row) =>
        row.type === "pickup" &&
        row.date >= filters.pickupFrom &&
        row.date <= filters.pickupTo &&
        row.total >= 1250 &&
        row.total <= 1850,
    )
    .sort((a, b) => a.total - b.total);
  expect(expected.length).toBeGreaterThan(0);
  expect((await exported(filters)).map((row) => row.reference_code)).toEqual(
    expected.map((row) => row.reference),
  );
  expect(
    await exported({
      ...filters,
      pickupTimeFrom: "10:01",
      pickupTimeTo: "11:00",
    }),
  ).toHaveLength(0);
  const input = {
    staffUserId: owner,
    view: "orders" as const,
    search: marker,
    status: "",
    page: 1,
    paymentSearch: "",
    paymentStatus: "",
    paymentType: "",
    paymentPage: 1,
    payoutPage: 1,
    evidencePage: 1,
    failurePage: 1,
  };
  const data = await getAdminOperations({ ...input, orderFilters: filters });
  expect(data.orderIndexItems).toHaveLength(expected.length);
  expect(
    data.orderIndexItems.every(
      (item) =>
        item.name === "Original cup" &&
        item.unitPriceCents === 1250 &&
        item.quantity === 2,
    ),
  ).toBe(true);
  expect(data.rows.map((row) => row.referenceCode)).toEqual(
    expected.map((row) => row.reference),
  );
  const first = await getAdminOperations({
    ...input,
    orderFilters: { sort: "customer", direction: "asc" },
  });
  const second = await getAdminOperations({
    ...input,
    page: 2,
    orderFilters: { sort: "customer", direction: "asc" },
  });
  expect(first.rows[50]!.id).toBe(second.rows[0]!.id);
  expect(first.orderIndexItems).toHaveLength(50);
  expect(
    first.orderIndexItems.some((item) => item.orderId === first.rows[50]!.id),
  ).toBe(false);
  expect(
    second.orderIndexItems.every((item) =>
      second.rows.slice(0, 50).some((order) => order.id === item.orderId),
    ),
  ).toBe(true);
  expect(
    first.rows
      .slice(0, 50)
      .some((row) => second.rows.some((other) => row.id === other.id)),
  ).toBe(false);
});

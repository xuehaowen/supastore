import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "@/infrastructure/db";
import { streamProductsCsv } from "@/application/use-cases/catalog/export-csv";
import { getSitemapPage } from "@/application/queries/sitemap";

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.endsWith("/supastore_test"))
    throw new Error("Export tests require the isolated integration database");
  await migrate(db, { migrationsFolder: "src/infrastructure/db/migrations" });
});
afterAll(async () => {
  await queryClient.end();
});

it("pages published sitemap handles without loading full product records", async () => {
  const prefix = randomUUID();
  const records = Array.from({ length: 1001 }, (_, index) => ({
    id: randomUUID(),
    handle: `${prefix}-${index}`,
  }));
  const hidden = randomUUID();
  try {
    await queryClient`insert into products(id,handle,title) select r.id,r.handle,'Sitemap fixture' from jsonb_to_recordset(${JSON.stringify(records)}::jsonb) as r(id uuid,handle text)`;
    await queryClient`insert into products(id,handle,title,is_published) values (${hidden},${hidden},'Hidden',false)`;
    const index = await getSitemapPage(1, true);
    expect(index.items).toHaveLength(0);
    const handles: string[] = [];
    for (let page = 1; page <= Math.ceil(index.total / 1000); page++) {
      const batch = await getSitemapPage(page);
      expect(batch.items.length).toBeLessThanOrEqual(1000);
      handles.push(...batch.items.map((item) => item.handle));
    }
    expect(
      new Set(handles.filter((handle) => handle.startsWith(prefix))).size,
    ).toBe(1001);
    expect(handles).not.toContain(hidden);
  } finally {
    await queryClient`delete from products where handle like ${prefix + "%"} or id=${hidden}`;
  }
});

it("limits statement execution and lock waits on runtime connections", async () => {
  const [settings] =
    await queryClient`select current_setting('statement_timeout') as statement,
    current_setting('lock_timeout') as lock, current_setting('idle_in_transaction_session_timeout') as idle`;
  expect(settings).toMatchObject({
    statement: "30s",
    lock: "5s",
    idle: "1min",
  });
});

it("exports every original variant once across deletions and excludes later creations", async () => {
  const product = randomUUID();
  const prefix = `export-${product}`;
  const entries = Array.from({ length: 203 }, (_, index) => ({
    id: randomUUID(),
    sku: `${prefix}-${String(index).padStart(3, "0")}`,
  }));
  await queryClient`insert into products(id,handle,title) values (${product}, ${prefix}, 'Export fixture')`;
  try {
    await queryClient`insert into product_variants(id,product_id,sku,title,price_cents,created_at)
      select r.id,${product}::uuid,r.sku,'Fixture',100,'1900-01-01 00:00:00.123456+00'::timestamptz
      from jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) as r(id uuid,sku text)`;
    const stream = streamProductsCsv();
    await stream.next(); // Header starts the export snapshot.
    const seen: string[] = [];
    while (seen.length < 200) {
      const row = await stream.next();
      expect(row.done).toBe(false);
      if (row.value!.startsWith(prefix + ",")) seen.push(row.value!);
    }
    const firstSku = seen[0]!.split(",")[1]!;
    await queryClient`delete from product_variants where sku=${firstSku}`;
    await queryClient`insert into product_variants(product_id,sku,title,price_cents,created_at)
      values (${product}, ${prefix + "-later"},'Later fixture',100,'2099-01-01')`;
    for await (const row of stream)
      if (row.startsWith(prefix + ",")) seen.push(row);
    expect(seen).toHaveLength(203);
    expect(new Set(seen.map((row) => row.split(",")[1])).size).toBe(203);
    expect(new Set(seen.map((row) => row.split(",")[1]))).toEqual(
      new Set(entries.map((entry) => entry.sku)),
    );
    expect(seen.some((row) => row.includes(prefix + "-later"))).toBe(false);
  } finally {
    await queryClient`delete from product_variants where product_id=${product}`;
    await queryClient`delete from products where id=${product}`;
  }
});

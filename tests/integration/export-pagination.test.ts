import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "@/infrastructure/db";
import { streamProductsCsv } from "@/application/use-cases/catalog/export-csv";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { getSitemapPage } from "@/application/queries/sitemap";
import {
  getCombinedSitemapIndex,
  getCombinedSitemapPage,
} from "@/application/queries/combined-sitemap";

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.endsWith("/supastore_test"))
    throw new Error("Export tests require the isolated integration database");
  await migrate(db, {
    migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
  });
});
afterAll(async () => {
  await queryClient.end();
});

it("keeps catalog pages bounded while concurrently exporting a 10,000-product catalog", async () => {
  const prefix = `scale-${randomUUID()}`;
  const started = performance.now();
  try {
    await queryClient`insert into products(handle,title) select ${prefix} || '-' || n, ${prefix} || ' product ' || n from generate_series(1,10000) n`;
    await queryClient`insert into product_variants(product_id,sku,title,price_cents) select id,handle,'Scale variant',100 from products where handle like ${prefix + "%"}`;
    await queryClient`analyze products`;
    await queryClient`analyze product_variants`;
    const exported = async () => {
      const seen = new Set<string>();
      let rows = 0;
      for await (const row of streamProductsCsv()) {
        if (!row.startsWith(prefix + "-")) continue;
        rows++;
        seen.add(row.split(",")[1]!);
      }
      return { rows, unique: seen.size };
    };
    const [firstResult, lastResult, exportResult] = await Promise.allSettled([
      listProducts({ search: prefix, page: 1, pageSize: 100 }),
      listProducts({ search: prefix, page: 100, pageSize: 100 }),
      exported(),
    ]);
    if (firstResult.status === "rejected") throw firstResult.reason;
    if (lastResult.status === "rejected") throw lastResult.reason;
    if (exportResult.status === "rejected") throw exportResult.reason;
    const first = firstResult.value,
      last = lastResult.value,
      csv = exportResult.value;
    expect(first.total).toBe(10000);
    expect(last.total).toBe(10000);
    expect(first.items).toHaveLength(100);
    expect(last.items).toHaveLength(100);
    expect(
      first.items.every(
        (item) => item.variantCount === 1 && item.lowestPriceCents === 100,
      ),
    ).toBe(true);
    expect(
      last.items.some((item) =>
        first.items.some((other) => other.id === item.id),
      ),
    ).toBe(false);
    expect(csv).toEqual({ rows: 10000, unique: 10000 });
    console.log(
      JSON.stringify({
        metric: "isolated PostgreSQL catalog/export regression",
        products: 10000,
        concurrentReaders: 3,
        elapsedMs: Math.round(performance.now() - started),
      }),
    );
  } finally {
    await queryClient`delete from product_variants where product_id in (select id from products where handle like ${prefix + "%"})`;
    await queryClient`delete from products where handle like ${prefix + "%"}`;
  }
}, 60000);

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
    const combined = await getCombinedSitemapIndex();
    const urls: string[] = [];
    for (let page = 1; page <= Math.ceil(combined.products / 1000); page++) {
      const batch = await getCombinedSitemapPage("products", page);
      expect(batch.length).toBeLessThanOrEqual(1000);
      urls.push(...batch.map((entry) => entry.path));
    }
    expect(new Set(urls.filter((url) => url.includes(prefix))).size).toBe(1001);
    expect(urls).not.toContain(`/products/${hidden}`);
  } finally {
    await queryClient`delete from products where handle like ${prefix + "%"} or id=${hidden}`;
  }
});

it("discovers categories and published collections beyond their former caps", async () => {
  const prefix = randomUUID();
  try {
    await queryClient`insert into categories(slug,name) select ${prefix} || '-' || n, 'Sitemap category' from generate_series(1,1001) n`;
    await queryClient`insert into product_collections(handle,title,is_published) select ${prefix} || '-' || n, 'Sitemap collection', true from generate_series(1,1001) n`;
    await queryClient`insert into product_collections(handle,title,is_published) values (${prefix + "-hidden"}, 'Hidden', false)`;
    const counts = await getCombinedSitemapIndex();
    for (const resource of ["categories", "collections"] as const) {
      const urls: string[] = [];
      for (let page = 1; page <= Math.ceil(counts[resource] / 1000); page++) {
        const batch = await getCombinedSitemapPage(resource, page);
        expect(batch.length).toBeLessThanOrEqual(1000);
        urls.push(...batch.map((entry) => entry.path));
      }
      expect(new Set(urls.filter((url) => url.includes(prefix))).size).toBe(
        1001,
      );
      expect(urls.some((url) => url.endsWith("-hidden"))).toBe(false);
    }
  } finally {
    await queryClient`delete from categories where slug like ${prefix + "%"}`;
    await queryClient`delete from product_collections where handle like ${prefix + "%"}`;
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

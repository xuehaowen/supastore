import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "@/infrastructure/db";
import { streamProductsCsv } from "@/application/use-cases/catalog/export-csv";

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.endsWith("/supastore_test"))
    throw new Error("Export tests require the isolated integration database");
  await migrate(db, { migrationsFolder: "src/infrastructure/db/migrations" });
});
afterAll(async () => {
  await queryClient.end();
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

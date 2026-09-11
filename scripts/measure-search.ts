import { performance } from "node:perf_hooks";
import { db, queryClient } from "../src/infrastructure/db";
import { sql } from "drizzle-orm";
if (!process.env.DATABASE_URL?.endsWith("/supastore_test"))
  throw new Error("Benchmark requires isolated supastore_test.");
const results: number[] = [];
await db.transaction(async (tx) => {
  await tx.execute(
    sql`insert into products(handle,title,description) select 'benchmark-'||n,'Cotton shirt '||n,'Everyday clothing' from generate_series(1,10000) n on conflict do nothing`,
  );
  await tx.execute(sql`analyze products`);
  await tx.execute(sql`set local pg_trgm.similarity_threshold = 0.15`);
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    await tx.execute(
      sql`select id from products where search_vector @@ plainto_tsquery('simple','shrit') or title % 'shrit' limit 24`,
    );
    results.push(performance.now() - start);
  }
  await tx.execute(sql`delete from products where handle like 'benchmark-%'`);
});
results.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      rows: 10000,
      iterations: 25,
      medianMs: results[12],
      p95Ms: results[23],
      includes: "driver and local query round trip",
    },
    null,
    2,
  ),
);
await queryClient.end();

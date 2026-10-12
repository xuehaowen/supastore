import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { products } from "@/infrastructure/db/schema";
import { DomainError } from "@/domain/errors";

export async function getSitemapPage(page: number, indexOnly = false) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 50000)
    throw new DomainError("Invalid sitemap page.");
  return db.transaction(async (tx) => {
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.isPublished, true));
    const total = count!.total;
    if (total > 50000000)
      throw new DomainError("Catalog exceeds sitemap capacity.");
    const items = indexOnly
      ? []
      : await tx
          .select({ handle: products.handle })
          .from(products)
          .where(eq(products.isPublished, true))
          .orderBy(asc(products.id))
          .limit(1000)
          .offset((page - 1) * 1000);
    return { total, pageSize: 1000, items };
  });
}

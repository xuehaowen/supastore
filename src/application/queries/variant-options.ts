import { and, asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { products, productVariants } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { DomainError } from "@/domain/errors";

export async function searchVariantOptions(
  staffUserId: string,
  query: string,
  scope: "sale" | "quota" = "sale",
) {
  const search = query.trim();
  if (search.length > 120) throw new DomainError("Variant search is too long.");
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const rows = await tx
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        title: productVariants.title,
        product: products.title,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          scope === "sale"
            ? and(
                eq(products.isPublished, true),
                eq(productVariants.isAvailable, true),
              )
            : undefined,
          search
            ? or(
                ilike(productVariants.sku, pattern),
                ilike(productVariants.title, pattern),
                ilike(products.title, pattern),
              )
            : undefined,
        ),
      )
      .orderBy(asc(productVariants.sku), asc(productVariants.id))
      .limit(51);
    return {
      options: rows.slice(0, 50).map((row) => ({
        id: row.id,
        label: `${row.product} · ${row.title} · ${row.sku}`,
      })),
      hasNext: rows.length > 50,
    };
  });
}

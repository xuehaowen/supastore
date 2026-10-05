import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { products, productVariants, storeSettings, productOptions, auditRecords } from "@/infrastructure/db/schema";
import { importCatalogAssociations } from "./import-catalog-associations";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { InvariantViolationError } from "@/application/common/errors";
import type { ProductCsvRow } from "@/domain/catalog/product-csv";
export { parseProductCsv } from "@/domain/catalog/product-csv";
export type { ProductCsvRow, CsvParseError, CsvPreview } from "@/domain/catalog/product-csv";
export interface ImportProductsCsvInput {
  rows: ProductCsvRow[];
  staffUserId: string;
}

export interface ImportResult {
  created: number;
  updated: number;
}

export async function importProductsCsv(
  input: ImportProductsCsvInput,
): Promise<ImportResult> {
  if (input.rows.length === 0) {
    throw new InvariantViolationError("No rows to import.");
  }
  if (input.rows.length > 100) throw new InvariantViolationError("Import at most 100 rows per batch. Use the import page for automatic bounded batches.");
  if (new Set(input.rows.map(r => r.sku)).size !== input.rows.length) throw new InvariantViolationError("Import SKUs must be unique.");
  const details = new Map<string, string>();
  for (const row of input.rows) { const value = JSON.stringify([row.productTitle, row.description, row.isPublished]); if (details.has(row.handle) && details.get(row.handle) !== value) throw new InvariantViolationError(`Rows for ${row.handle} must agree on product title, description and publication.`); details.set(row.handle, value); }
  for (const row of input.rows) if (!Number.isSafeInteger(row.priceCents) || row.priceCents < 0 || row.priceCents > 2147483647 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.handle) || !row.sku || row.sku.length > 200 || !row.productTitle || row.productTitle.length > 200) throw new InvariantViolationError("Invalid product import row.");

  return await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");

    let created = 0;
    let updated = 0;

    // Fetch existing products by handle in one query
    const handles = [...new Set(input.rows.map((r) => r.handle))];
    const existingProducts = await tx
      .select({ id: products.id, handle: products.handle })
      .from(products)
      .where(inArray(products.handle, handles));

    const productByHandle = new Map(existingProducts.map((p) => [p.handle, p]));

    // Fetch existing variants by sku in one query
    const skus = input.rows.map((r) => r.sku);
    const existingVariants = await tx
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        productId: productVariants.productId,
      })
      .from(productVariants)
      .where(inArray(productVariants.sku, skus));

    const variantBySku = new Map(existingVariants.map((v) => [v.sku, v]));

    for (const row of input.rows) {
      // Upsert product
      let productId: string;
      const existing = productByHandle.get(row.handle);

      if (existing) {
        await tx
          .update(products)
          .set({
            title: row.productTitle,
            description: row.description,
            isPublished: row.isPublished,
            quoteVersion: sql`${products.quoteVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, existing.id));
        productId = existing.id;
      } else {
        const [inserted] = await tx
          .insert(products)
          .values({
            handle: row.handle,
            title: row.productTitle,
            description: row.description,
            isPublished: row.isPublished,
          })
          .returning({ id: products.id });
        productId = inserted!.id;
        productByHandle.set(row.handle, { id: productId, handle: row.handle });
      }

      // Upsert variant while preserving its identity and canonical assignments.
      const existingVariant = variantBySku.get(row.sku);
      if (existingVariant) {
        if (existingVariant.productId !== productId)
          throw new InvariantViolationError(
            `SKU ${row.sku} already belongs to another product.`,
          );
        await tx
          .update(productVariants)
          .set({
            title: row.variantTitle,
            priceCents: row.priceCents,
            isAvailable: row.isAvailable,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, existingVariant.id));
        await tx
          .update(products)
          .set({
            quoteVersion: sql`${products.quoteVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, productId));
        updated++;
        await importCatalogAssociations(tx, productId, existingVariant.id, row, false);
      } else {
        const [inserted] = await tx.insert(productVariants).values({
          productId,
          sku: row.sku,
          title: row.variantTitle,
          priceCents: row.priceCents,
          isAvailable: row.isAvailable,
        }).returning();
        await importCatalogAssociations(tx, productId, inserted!.id, row, true);
        created++;
      }
    }
    for (const product of productByHandle.values()) {
      const variants = await tx.select().from(productVariants).where(eq(productVariants.productId, product.id));
      if (variants.length > 50) throw new InvariantViolationError(`Product ${product.handle} exceeds 50 variants.`);
      const options = await tx.select().from(productOptions).where(eq(productOptions.productId, product.id));
      if (options.length && variants.some(v => !v.combinationKey)) throw new InvariantViolationError(`Product ${product.handle} has unmapped legacy variants. Supply explicit option_values for every legacy SKU before configuring options.`);
      await tx.insert(auditRecords).values({ entityType: "product", entityId: product.id, actorId: input.staffUserId, action: "catalog.csv_imported", details: { rowCount: input.rows.filter(r => r.handle === product.handle).length } });
    }

    return { created, updated };
  });
}

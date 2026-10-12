import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  storeSettings,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";

export async function bulkUpdateVariants(input: {
  staffUserId: string;
  productId: string;
  revision: number;
  variantIds: string[];
  priceCents?: number;
  isAvailable?: boolean;
}) {
  const productId = parseActionUuid(input.productId, "Product");
  const revision = parseActionInteger(
    input.revision,
    "Revision",
    1,
    2147483647,
  );
  if (
    !input.variantIds.length ||
    input.variantIds.length > 50 ||
    new Set(input.variantIds).size !== input.variantIds.length
  )
    throw new DomainError("Select between 1 and 50 distinct variants.");
  const ids = input.variantIds.map((id) => parseActionUuid(id, "Variant"));
  if (input.priceCents === undefined && input.isAvailable === undefined)
    throw new DomainError("Choose a price or availability change.");
  const priceCents =
    input.priceCents === undefined
      ? undefined
      : parseActionInteger(input.priceCents, "Price", 0, 2147483647);
  if (input.isAvailable !== undefined && typeof input.isAvailable !== "boolean")
    throw new DomainError("Choose valid availability.");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!product) throw new NotFoundError("Product not found.");
    if (product.quoteVersion !== revision)
      throw new ConflictError(
        "Product changed. Reload before applying bulk changes.",
      );
    const selected = await tx
      .select({
        id: productVariants.id,
        priceCents: productVariants.priceCents,
        isAvailable: productVariants.isAvailable,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          inArray(productVariants.id, ids),
        ),
      );
    if (selected.length !== ids.length)
      throw new DomainError("Selected variants must belong to this product.");
    await tx
      .update(productVariants)
      .set({
        ...(priceCents === undefined ? {} : { priceCents }),
        ...(input.isAvailable === undefined
          ? {}
          : { isAvailable: input.isAvailable }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productVariants.productId, productId),
          inArray(productVariants.id, ids),
        ),
      );
    await tx
      .update(products)
      .set({ quoteVersion: revision + 1, updatedAt: new Date() })
      .where(eq(products.id, productId));
    await tx.insert(auditRecords).values({
      entityType: "product",
      entityId: productId,
      actorId: input.staffUserId,
      action: "variants.bulk_updated",
      details: {
        before: selected,
        priceCents,
        isAvailable: input.isAvailable,
      },
    });
    return { updated: selected.length };
  });
}

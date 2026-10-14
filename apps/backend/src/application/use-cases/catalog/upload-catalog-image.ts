import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  productImages,
  productCollections,
  catalogMediaUploads,
  storeSettings,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
import { validateEvidence } from "@/domain/evidence";
import { putCatalogAsset, deleteCatalogAsset } from "@/infrastructure/storage";
import {
  DomainError,
  ConflictError,
  NotFoundError,
} from "@/application/common/errors";
export async function uploadCatalogImage(input: {
  staffUserId: string;
  entityId: string;
  entityType: "product" | "collection";
  variantId?: string;
  altText: string;
  bytes: Uint8Array;
  mime: string;
}) {
  const entityId = parseActionUuid(input.entityId, "Product or collection");
  const altText = parseActionRequiredText(
    input.altText,
    "Image description",
    200,
  );
  const variantId = input.variantId
    ? parseActionUuid(input.variantId, "Variant")
    : undefined;
  const mime = validateEvidence(
    input.bytes,
    input.bytes.length,
    input.bytes.length,
    input.mime,
    input.mime,
  );
  const id = randomUUID(),
    key = `catalog/${entityId}/${id}.${mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp"}`;
  const version = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    let version: number;
    if (input.entityType === "product") {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, entityId));
      if (!product) throw new NotFoundError("Product not found.");
      version = product.quoteVersion;
    } else {
      const [collection] = await tx
        .select()
        .from(productCollections)
        .where(eq(productCollections.id, entityId));
      if (!collection) throw new NotFoundError("Collection not found.");
      version = collection.revision;
    }
    await tx.insert(catalogMediaUploads).values({
      id,
      entityId,
      entityType: input.entityType,
      actorId: input.staffUserId,
      s3Key: key,
      expiresAt: new Date(Date.now() + 3600000),
    });
    return version;
  });
  let attached = false;
  try {
    // Network I/O is outside both transactions. The immutable key is server-created.
    await putCatalogAsset(key, mime, input.bytes);
    await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, input.staffUserId, "owner");
      await tx.select().from(storeSettings).for("update");
      if (input.entityType === "product") {
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, entityId))
          .for("update");
        if (!product || product.quoteVersion !== version)
          throw new ConflictError(
            "Product changed during upload. Reload and retry.",
          );
        const existing = await tx
          .select()
          .from(productImages)
          .where(eq(productImages.productId, entityId));
        if (existing.length >= 20)
          throw new DomainError("A product can have up to 20 images.");
        if (variantId) {
          const [variant] = await tx
            .select()
            .from(productVariants)
            .where(
              and(
                eq(productVariants.id, variantId),
                eq(productVariants.productId, entityId),
              ),
            );
          if (!variant)
            throw new NotFoundError("Variant does not belong to this product.");
        }
        await tx.insert(productImages).values({
          productId: entityId,
          variantId: variantId || null,
          s3Key: key,
          altText,
          sortOrder:
            existing.reduce((max, img) => Math.max(max, img.sortOrder), -1) + 1,
        });
        await tx
          .update(products)
          .set({
            quoteVersion: sql`${products.quoteVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, entityId));
      } else {
        const [collection] = await tx
          .select()
          .from(productCollections)
          .where(eq(productCollections.id, entityId))
          .for("update");
        if (!collection || collection.revision !== version)
          throw new ConflictError(
            "Collection changed during upload. Reload and retry.",
          );
        await tx
          .update(productCollections)
          .set({
            imageKey: key,
            imageAlt: altText,
            revision: version + 1,
            updatedAt: new Date(),
          })
          .where(eq(productCollections.id, entityId));
        if (collection.imageKey)
          await tx
            .update(catalogMediaUploads)
            .set({ status: "pending", expiresAt: new Date() })
            .where(
              and(
                eq(catalogMediaUploads.s3Key, collection.imageKey),
                eq(catalogMediaUploads.entityId, entityId),
                eq(catalogMediaUploads.status, "attached"),
              ),
            );
      }
      const [intent] = await tx
        .select()
        .from(catalogMediaUploads)
        .where(eq(catalogMediaUploads.id, id))
        .for("update");
      if (
        !intent ||
        intent.status !== "pending" ||
        intent.expiresAt <= new Date()
      )
        throw new ConflictError("Upload expired. Retry with a new image.");
      await tx
        .update(catalogMediaUploads)
        .set({ status: "attached" })
        .where(eq(catalogMediaUploads.id, id));
      await tx.insert(auditRecords).values({
        entityType: input.entityType,
        entityId,
        actorId: input.staffUserId,
        action: "image.uploaded",
        details: { uploadId: id, altText },
      });
    });
    attached = true;
  } finally {
    if (!attached) {
      try {
        await deleteCatalogAsset(key);
      } catch {
        /* pending intent remains for worker cleanup */
      }
    }
  }
}

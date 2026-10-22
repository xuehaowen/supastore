import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  catalogMediaUploads,
  productImages,
  productCollections,
} from "@/infrastructure/db/schema";
import { deleteCatalogAsset } from "@/infrastructure/storage";
import { logger } from "@/infrastructure/security/logger";
export async function cleanupCatalogMedia(uploadId?: string) {
  const candidates = await db
    .select()
    .from(catalogMediaUploads)
    .where(
      and(
        inArray(catalogMediaUploads.status, ["pending", "expired"]),
        lte(catalogMediaUploads.expiresAt, new Date()),
        uploadId ? eq(catalogMediaUploads.id, uploadId) : undefined,
      ),
    )
    .orderBy(asc(catalogMediaUploads.expiresAt))
    .limit(100);
  for (const upload of candidates) {
    const [claimed] = await db
      .update(catalogMediaUploads)
      .set({ status: "expired" })
      .where(
        and(
          eq(catalogMediaUploads.id, upload.id),
          inArray(catalogMediaUploads.status, ["pending", "expired"]),
          lte(catalogMediaUploads.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!claimed) continue;
    const [image] = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.s3Key, upload.s3Key))
      .limit(1);
    const [cover] = await db
      .select({ id: productCollections.id })
      .from(productCollections)
      .where(eq(productCollections.imageKey, upload.s3Key))
      .limit(1);
    if (image || cover) {
      await db
        .update(catalogMediaUploads)
        .set({ status: "attached" })
        .where(eq(catalogMediaUploads.id, upload.id));
      continue;
    }
    try {
      await deleteCatalogAsset(upload.s3Key);
      await db
        .update(catalogMediaUploads)
        .set({ status: "deleted" })
        .where(
          and(
            eq(catalogMediaUploads.id, upload.id),
            eq(catalogMediaUploads.status, "expired"),
          ),
        );
    } catch (e) {
      logger.error(
        `Catalog media cleanup failed for ${upload.id}; the expired upload will retry.`,
        e,
      );
      if (uploadId) throw e;
    }
  }
}

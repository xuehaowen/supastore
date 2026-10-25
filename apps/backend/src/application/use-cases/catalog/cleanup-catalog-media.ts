import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  catalogMediaUploads,
  productImages,
  productCollections,
  storeSettings,
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
    // Serialize reference retention with hero replacement so a retired upload
    // cannot be marked attached after the owner has scheduled its cleanup.
    const retained = await db.transaction(async (tx) => {
      const [store] = await tx
        .select({ hero: storeSettings.storefrontHero })
        .from(storeSettings)
        .limit(1)
        .for("update");
      const [image] = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .where(eq(productImages.s3Key, upload.s3Key))
        .limit(1);
      const [cover] = await tx
        .select({ id: productCollections.id })
        .from(productCollections)
        .where(eq(productCollections.imageKey, upload.s3Key))
        .limit(1);
      if (!image && !cover && store?.hero?.imageKey !== upload.s3Key)
        return false;
      await tx
        .update(catalogMediaUploads)
        .set({ status: "attached" })
        .where(eq(catalogMediaUploads.id, upload.id));
      return true;
    });
    if (retained) continue;
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

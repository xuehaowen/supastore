import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  scheduledActions,
  catalogMediaUploads,
  paymentUploadIntents,
  uploadCandidates,
} from "@/infrastructure/db/schema";
import { cleanupUploads } from "@/application/use-cases/uploads/cleanup-uploads";
import { cleanupCatalogMedia } from "@/application/use-cases/catalog/cleanup-catalog-media";

export async function expireUpload(data: { key: string; jobId: string }) {
  const [action] = await db
    .select()
    .from(scheduledActions)
    .where(eq(scheduledActions.key, data.key));
  if (!action || action.jobId !== data.jobId || action.status !== "pending")
    return;
  if (action.scheduledFor > new Date())
    throw new Error("Upload cleanup is not due.");
  if (action.kind === "catalog-upload") {
    await cleanupCatalogMedia(action.entityId);
    const [upload] = await db
      .select()
      .from(catalogMediaUploads)
      .where(eq(catalogMediaUploads.id, action.entityId));
    if (upload && !["deleted", "attached"].includes(upload.status))
      throw new Error("Catalog upload cleanup deferred.");
  } else if (action.kind === "payment-upload") {
    await cleanupUploads(action.entityId);
    const [intent] = await db
      .select()
      .from(paymentUploadIntents)
      .where(eq(paymentUploadIntents.id, action.entityId));
    const [candidate] = await db
      .select({ id: uploadCandidates.id })
      .from(uploadCandidates)
      .where(
        and(
          eq(uploadCandidates.intentId, action.entityId),
          ne(uploadCandidates.status, "attached"),
          isNull(uploadCandidates.deletedAt),
        ),
      )
      .limit(1);
    if ((intent && !intent.stagingDeletedAt) || candidate)
      throw new Error(
        "Payment upload cleanup deferred by an active lease or expiry change.",
      );
  } else if (action.kind === "upload-candidate") {
    const [candidate] = await db
      .select()
      .from(uploadCandidates)
      .where(eq(uploadCandidates.id, action.entityId));
    if (candidate && candidate.status !== "attached" && !candidate.deletedAt) {
      await cleanupUploads(candidate.intentId);
      const [current] = await db
        .select()
        .from(uploadCandidates)
        .where(eq(uploadCandidates.id, action.entityId));
      if (current && current.status !== "attached" && !current.deletedAt)
        throw new Error("Candidate cleanup deferred by an active lease.");
    }
  } else throw new Error("Unexpected expiration action.");
  await db
    .update(scheduledActions)
    .set({ status: "completed", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledActions.key, data.key),
        eq(scheduledActions.jobId, data.jobId),
      ),
    );
}

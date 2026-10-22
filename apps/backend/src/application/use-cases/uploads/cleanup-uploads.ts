import { and, asc, eq, isNull, lte, ne, or } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentUploadIntents,
  uploadCandidates,
} from "@/infrastructure/db/schema";
import { deleteObject } from "@/infrastructure/storage";
export async function cleanupUploads(intentId?: string) {
  const intents = await db
    .select()
    .from(paymentUploadIntents)
    .where(
      and(
        lte(paymentUploadIntents.expiresAt, new Date()),
        isNull(paymentUploadIntents.stagingDeletedAt),
        intentId ? eq(paymentUploadIntents.id, intentId) : undefined,
      ),
    )
    .orderBy(asc(paymentUploadIntents.expiresAt))
    .limit(100);
  for (const intent of intents) {
    const key = await db.transaction(async (tx) => {
      await tx
        .select()
        .from(orders)
        .where(eq(orders.id, intent.orderId))
        .for("update");
      const [current] = await tx
        .select()
        .from(paymentUploadIntents)
        .where(eq(paymentUploadIntents.id, intent.id))
        .for("update");
      if (
        !current ||
        current.expiresAt > new Date() ||
        current.stagingDeletedAt
      )
        return null;
      const active = await tx
        .select()
        .from(uploadCandidates)
        .where(
          and(
            eq(uploadCandidates.intentId, intent.id),
            eq(uploadCandidates.status, "active"),
          ),
        );
      if (active.some((c) => c.leaseExpiresAt > new Date())) return null;
      if (current.status !== "finalized")
        await tx
          .update(paymentUploadIntents)
          .set({ status: "expired" })
          .where(eq(paymentUploadIntents.id, intent.id));
      return current.s3Key;
    });
    if (key) {
      await deleteObject(key);
      await db
        .update(paymentUploadIntents)
        .set({ stagingDeletedAt: new Date() })
        .where(eq(paymentUploadIntents.id, intent.id));
    }
  }
  const candidates = await db
    .select()
    .from(uploadCandidates)
    .where(
      and(
        isNull(uploadCandidates.deletedAt),
        intentId ? eq(uploadCandidates.intentId, intentId) : undefined,
        or(
          eq(uploadCandidates.status, "retired"),
          and(
            eq(uploadCandidates.status, "active"),
            lte(uploadCandidates.leaseExpiresAt, new Date()),
          ),
        ),
      ),
    )
    .orderBy(asc(uploadCandidates.leaseExpiresAt))
    .limit(100);
  for (const candidate of candidates) {
    const [retired] = await db
      .update(uploadCandidates)
      .set({ status: "retired" })
      .where(
        and(
          eq(uploadCandidates.id, candidate.id),
          ne(uploadCandidates.status, "attached"),
          isNull(uploadCandidates.deletedAt),
          or(
            eq(uploadCandidates.status, "retired"),
            lte(uploadCandidates.leaseExpiresAt, new Date()),
          ),
        ),
      )
      .returning();
    if (retired) {
      await deleteObject(retired.key);
      await db
        .update(uploadCandidates)
        .set({ deletedAt: new Date() })
        .where(eq(uploadCandidates.id, retired.id));
    }
  }
}

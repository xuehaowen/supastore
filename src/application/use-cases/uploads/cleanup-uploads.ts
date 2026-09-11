import { and, eq, lt, ne, or } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentUploadIntents,
  uploadCandidates,
} from "@/infrastructure/db/schema";
import { deleteObject } from "@/infrastructure/storage";
export async function cleanupUploads() {
  const intents = await db
    .select()
    .from(paymentUploadIntents)
    .where(lt(paymentUploadIntents.expiresAt, new Date()));
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
      if (!current) return null;
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
    if (key) await deleteObject(key);
  }
  const candidates = await db
    .select()
    .from(uploadCandidates)
    .where(
      or(
        eq(uploadCandidates.status, "retired"),
        and(
          eq(uploadCandidates.status, "active"),
          lt(uploadCandidates.leaseExpiresAt, new Date()),
        ),
      ),
    );
  for (const candidate of candidates) {
    const [retired] = await db
      .update(uploadCandidates)
      .set({ status: "retired" })
      .where(
        and(
          eq(uploadCandidates.id, candidate.id),
          ne(uploadCandidates.status, "attached"),
        ),
      )
      .returning();
    if (retired) await deleteObject(retired.key);
  }
}

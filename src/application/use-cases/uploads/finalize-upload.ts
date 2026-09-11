import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentUploadIntents,
  uploadCandidates,
} from "@/infrastructure/db/schema";
import { verifyOrderAccess } from "@/application/common/guest-access";
import { InvariantViolationError } from "@/application/common/errors";
import { copyCandidate, deleteObject } from "@/infrastructure/storage";
import { validateEvidence } from "@/domain/evidence";
import { emitOrderEvent } from "@/application/common/events";
export async function finalizeUpload(input: {
  intentId: string;
  orderId: string;
  sessionToken: string;
}) {
  const candidateKey = "evidence/" + randomUUID();
  const prepared = await db.transaction(async (tx) => {
    await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for("update");
    await verifyOrderAccess(tx, input.orderId, input.sessionToken);
    const [intent] = await tx
      .select()
      .from(paymentUploadIntents)
      .where(
        and(
          eq(paymentUploadIntents.id, input.intentId),
          eq(paymentUploadIntents.orderId, input.orderId),
        ),
      )
      .for("update");
    if (!intent) throw new InvariantViolationError("Upload not found.");
    if (intent.status === "finalized") return { intent, candidate: null };
    if (intent.expiresAt <= new Date() || intent.status === "expired")
      throw new InvariantViolationError("Upload expired. Please upload again.");
    const [candidate] = await tx
      .insert(uploadCandidates)
      .values({
        intentId: intent.id,
        key: candidateKey,
        leaseExpiresAt: new Date(Date.now() + 5 * 60000),
      })
      .returning();
    return { intent, candidate: candidate! };
  });
  if (!prepared.candidate) return prepared.intent;
  const { intent, candidate } = prepared;
  try {
    // Storage I/O is outside DB transactions. The candidate key is server-only.
    const object = await copyCandidate(intent.s3Key, candidate.key);
    const mime = validateEvidence(
      object.bytes,
      object.size,
      intent.declaredSizeBytes,
      object.mime,
      intent.declaredMimeType,
    );
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .for("update");
      await verifyOrderAccess(tx, input.orderId, input.sessionToken);
      const [current] = await tx
        .select()
        .from(paymentUploadIntents)
        .where(eq(paymentUploadIntents.id, intent.id))
        .for("update");
      const [lease] = await tx
        .select()
        .from(uploadCandidates)
        .where(eq(uploadCandidates.id, candidate.id))
        .for("update");
      if (current!.status === "finalized") return current!;
      if (
        current!.expiresAt <= new Date() ||
        current!.status === "expired" ||
        lease!.status !== "active" ||
        lease!.leaseExpiresAt <= new Date()
      )
        throw new InvariantViolationError(
          "Upload expired. Please upload again.",
        );
      const [finalized] = await tx
        .update(paymentUploadIntents)
        .set({
          finalKey: candidate.key,
          status: "finalized",
          verifiedMimeType: mime,
          finalizedAt: new Date(),
        })
        .where(eq(paymentUploadIntents.id, intent.id))
        .returning();
      await tx
        .update(uploadCandidates)
        .set({ status: "attached" })
        .where(eq(uploadCandidates.id, candidate.id));
      await emitOrderEvent(
        tx,
        order!.id,
        "payment.evidence_uploaded",
        order!.guestEmail,
        { orderId: order!.id, intentId: intent.id },
      );
      return finalized!;
    });
    return result;
  } finally {
    // An uncertain DB commit must never cause deletion of an attached candidate.
    const [retired] = await db
      .update(uploadCandidates)
      .set({ status: "retired" })
      .where(
        and(
          eq(uploadCandidates.id, candidate.id),
          eq(uploadCandidates.status, "active"),
        ),
      )
      .returning();
    if (retired)
      await deleteObject(retired.key).catch(() => {
        /* Durable retired row is retried by cleanup. */
      });
  }
}

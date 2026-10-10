import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/infrastructure/db";
import { paymentUploadIntents } from "@/infrastructure/db/schema";
import { verifyOrderAccess } from "@/application/common/guest-access";
import {
  DomainError,
  InvariantViolationError,
} from "@/application/common/errors";
import { orderToken } from "@/infrastructure/web";
import { parseActionUuid } from "@/application/common/request-validation";
import { putUpload } from "@/infrastructure/storage";
import { assertMutationOrigin } from "@/infrastructure/http/commerce-api";
import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  MAX_EVIDENCE_SIZE_BYTES,
} from "@/domain/evidence";

export async function PUT(request: NextRequest) {
  try {
    assertMutationOrigin(request);
    const orderId = parseActionUuid(
      request.nextUrl.searchParams.get("orderId"),
      "Order",
    );
    const intentId = parseActionUuid(
      request.nextUrl.searchParams.get("intentId"),
      "Upload intent",
    );
    const mime = request.headers.get("content-type") ?? "";
    if (
      !ALLOWED_EVIDENCE_MIME_TYPES.includes(
        mime as (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number],
      )
    )
      throw new InvariantViolationError("Choose a JPEG, PNG, or WebP image.");
    const declaredLength = request.headers.get("content-length");
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) >= MAX_EVIDENCE_SIZE_BYTES)
    )
      throw new InvariantViolationError("Choose an image smaller than 5 MB.");
    const body = await readEvidenceBody(request);
    if (body.byteLength <= 0 || body.byteLength >= MAX_EVIDENCE_SIZE_BYTES)
      throw new InvariantViolationError("Choose an image smaller than 5 MB.");
    const sessionToken = await orderToken(orderId);
    await db.transaction(async (tx) => {
      await verifyOrderAccess(tx, orderId, sessionToken);
      const [intent] = await tx
        .select()
        .from(paymentUploadIntents)
        .where(
          and(
            eq(paymentUploadIntents.id, intentId),
            eq(paymentUploadIntents.orderId, orderId),
          ),
        )
        .limit(1);
      if (
        !intent ||
        intent.status !== "pending" ||
        intent.expiresAt <= new Date()
      )
        throw new InvariantViolationError(
          "Upload expired. Please choose the image again.",
        );
      if (
        intent.declaredMimeType !== mime ||
        intent.declaredSizeBytes !== body.byteLength
      )
        throw new InvariantViolationError(
          "The selected image changed before upload. Please choose it again.",
        );
      await putUpload(intent.s3Key, mime, body);
    });
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const storageCode = (error as { name?: string }).name;
    return NextResponse.json(
      {
        error:
          storageCode === "NoSuchBucket"
            ? "File storage is not ready yet. Please ask the store administrator to finish storage setup."
            : error instanceof DomainError
              ? error.message
              : "Upload failed. Please try again.",
      },
      {
        status:
          error instanceof DomainError && error.code === "UNAUTHORIZED"
            ? 401
            : error instanceof DomainError && error.code === "FORBIDDEN"
              ? 403
              : 400,
      },
    );
  }
}

async function readEvidenceBody(request: NextRequest): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size >= MAX_EVIDENCE_SIZE_BYTES) {
        await reader.cancel();
        throw new InvariantViolationError("Choose an image smaller than 5 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

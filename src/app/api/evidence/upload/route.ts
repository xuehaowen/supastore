import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/infrastructure/db";
import { paymentUploadIntents } from "@/infrastructure/db/schema";
import { verifyOrderAccess } from "@/application/common/guest-access";
import { DomainError, InvariantViolationError } from "@/application/common/errors";
import { orderToken } from "@/infrastructure/web";
import { putUpload } from "@/infrastructure/storage";
import { ALLOWED_EVIDENCE_MIME_TYPES, MAX_EVIDENCE_SIZE_BYTES } from "@/domain/evidence";

export async function PUT(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
    const intentId = request.nextUrl.searchParams.get("intentId") ?? "";
    const mime = request.headers.get("content-type") ?? "";
    const body = new Uint8Array(await request.arrayBuffer());
    if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(mime as (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number]))
      throw new InvariantViolationError("Choose a JPEG, PNG, or WebP image.");
    if (body.byteLength <= 0 || body.byteLength >= MAX_EVIDENCE_SIZE_BYTES)
      throw new InvariantViolationError("Choose an image smaller than 5 MB.");
    const sessionToken = await orderToken(orderId);
    await db.transaction(async (tx) => {
      await verifyOrderAccess(tx, orderId, sessionToken);
      const [intent] = await tx
        .select()
        .from(paymentUploadIntents)
        .where(and(eq(paymentUploadIntents.id, intentId), eq(paymentUploadIntents.orderId, orderId)))
        .limit(1);
      if (!intent || intent.status !== "pending" || intent.expiresAt <= new Date())
        throw new InvariantViolationError("Upload expired. Please choose the image again.");
      if (intent.declaredMimeType !== mime || intent.declaredSizeBytes !== body.byteLength)
        throw new InvariantViolationError("The selected image changed before upload. Please choose it again.");
      await putUpload(intent.s3Key, mime, body);
    });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const storageCode = (error as { name?: string }).name;
    return NextResponse.json(
      {
        error:
          storageCode === "NoSuchBucket"
            ? "File storage is not ready yet. Please ask the store administrator to finish storage setup."
            : error instanceof DomainError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Upload failed. Please try again.",
      },
      { status: error instanceof DomainError && error.code === "UNAUTHORIZED" ? 401 : 400 },
    );
  }
}

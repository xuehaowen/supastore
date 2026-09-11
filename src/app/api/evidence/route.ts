import { allowRequest } from "@/application/common/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { createUploadIntent } from "@/application/use-cases/uploads/create-upload-intent";
import { finalizeUpload } from "@/application/use-cases/uploads/finalize-upload";
import { orderToken } from "@/infrastructure/web";
import { DomainError } from "@/application/common/errors";
const uuid = v.pipe(v.string(), v.uuid());
async function handle(request: NextRequest, finalize: boolean) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const body = await request.json();
    const orderId = v.parse(uuid, body.orderId);
    const sessionToken = await orderToken(orderId);
    if (!allowRequest("evidence:" + sessionToken, 20))
      return NextResponse.json(
        { error: "Please wait before uploading again." },
        { status: 429 },
      );
    const result = finalize
      ? await finalizeUpload({
          orderId,
          sessionToken,
          intentId: v.parse(uuid, body.intentId),
        })
      : await createUploadIntent({
          orderId,
          sessionToken,
          declaredMimeType: v.parse(v.string(), body.mime),
          declaredSizeBytes: v.parse(v.number(), body.size),
        });
    return NextResponse.json(finalize ? { success: true } : result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DomainError || error instanceof v.ValiError
            ? error.message
            : "Upload failed. Please try again.",
      },
      {
        status:
          error instanceof DomainError && error.code === "UNAUTHORIZED"
            ? 401
            : 400,
      },
    );
  }
}
export async function POST(request: NextRequest) {
  return handle(request, false);
}
export async function PATCH(request: NextRequest) {
  return handle(request, true);
}

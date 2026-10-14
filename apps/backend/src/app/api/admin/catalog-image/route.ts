import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { productImages, productCollections } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { presignAsset } from "@/infrastructure/storage";
export async function GET(request: NextRequest) {
  try {
    const staff = await staffIdentity(),
      id = request.nextUrl.searchParams.get("id"),
      collectionId = request.nextUrl.searchParams.get("collectionId");
    if (!/^[0-9a-f-]{36}$/i.test(id || collectionId || ""))
      return new NextResponse("Not found", { status: 404 });
    const key = await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, staff);
      if (id) {
        const [image] = await tx
          .select()
          .from(productImages)
          .where(eq(productImages.id, id));
        return image?.s3Key;
      }
      const [collection] = await tx
        .select()
        .from(productCollections)
        .where(eq(productCollections.id, collectionId!));
      return collection?.imageKey;
    });
    if (!key) return new NextResponse("Not found", { status: 404 });
    return NextResponse.redirect(await presignAsset(key), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return new NextResponse("Unavailable", { status: 403 });
  }
}

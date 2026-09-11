import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  productImages,
  products,
  storeSettings,
} from "@/infrastructure/db/schema";
import { presignAsset } from "@/infrastructure/storage";
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const [image] = await db
    .select({ key: productImages.s3Key })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(and(eq(productImages.s3Key, key), eq(products.isPublished, true)))
    .limit(1);
  const [logo] = await db
    .select({ key: storeSettings.logoKey })
    .from(storeSettings)
    .where(eq(storeSettings.logoKey, key))
    .limit(1);
  if (!image && !logo) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(await presignAsset(key));
}

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  productImages,
  products,
  storeSettings,
  productCollections,
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
  const [collection] = await db
    .select({ key: productCollections.imageKey })
    .from(productCollections)
    .where(
      and(
        eq(productCollections.imageKey, key),
        eq(productCollections.isPublished, true),
      ),
    )
    .limit(1);
  if (!image && !logo && !collection)
    return new NextResponse("Not found", { status: 404 });
  const url = await presignAsset(key);
  if (request.nextUrl.searchParams.get("inline") !== "1")
    return NextResponse.redirect(url);
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const type = upstream.headers.get("content-type")?.split(";")[0];
    if (!upstream.ok || !upstream.body || !type ||
      !["image/jpeg", "image/png", "image/webp"].includes(type))
      throw new Error("Invalid image response");
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 5 * 1024 * 1024) throw new Error("Image too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new NextResponse(bytes, { headers: {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=60",
    } });
  } catch {
    return new NextResponse("Image unavailable", { status: 502 });
  }
}

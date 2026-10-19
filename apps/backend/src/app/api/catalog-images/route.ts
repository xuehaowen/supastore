import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { staffIdentity } from "@/infrastructure/web";
import { uploadCatalogImage } from "@/application/use-cases/catalog/upload-catalog-image";
import { DomainError, ForbiddenError } from "@/application/common/errors";
import { assertMutationOrigin } from "@/infrastructure/http/commerce-api";
export async function POST(request: NextRequest) {
  try {
    assertMutationOrigin(request);
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    throw error;
  }
  if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
    return NextResponse.json(
      { error: "Image must be smaller than 5 MB." },
      { status: 413 },
    );
  try {
    const staffUserId = await staffIdentity();
    const form = await request.formData(),
      file = form.get("file");
    if (!(file instanceof File) || file.size >= 5 * 1024 * 1024)
      throw new DomainError("Choose a JPEG, PNG, or WebP smaller than 5 MB.");
    const entityType = form.get("entityType");
    if (entityType !== "product" && entityType !== "collection")
      throw new DomainError("Invalid image owner.");
    const variantId = String(form.get("variantId") || "");
    await uploadCatalogImage({
      staffUserId,
      entityId: String(form.get("entityId") || ""),
      entityType,
      ...(variantId ? { variantId } : {}),
      altText: String(form.get("altText") || ""),
      bytes: new Uint8Array(await file.arrayBuffer()),
      mime: file.type,
    });
    revalidateTag("catalog");
    revalidatePath("/admin", "layout");
    revalidatePath("/[locale]", "layout");
    return NextResponse.json({ saved: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof DomainError
            ? e.message
            : "Image upload failed. Please retry.",
      },
      { status: 400 },
    );
  }
}

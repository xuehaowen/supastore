import {
  boundedJson,
  deadlineFetch as fetch,
} from "@/infrastructure/http/bounded-json";

export interface CatalogImageSelection {
  file: File;
  altText: string;
  status: "pending" | "uploading" | "uploaded" | "failed";
  error?: string;
}

export async function uploadCatalogImages(
  target: {
    entityType: "product" | "collection";
    entityId: string;
    variantId?: string;
  },
  images: readonly CatalogImageSelection[],
  onProgress?: (index: number, image: CatalogImageSelection) => void,
): Promise<CatalogImageSelection[]> {
  if (target.entityType === "collection" && images.length > 1)
    throw new Error("Choose one image for a collection cover.");
  if (images.length > 20) throw new Error("Choose up to 20 images at a time.");
  const results = [...images];
  for (const [index, image] of images.entries()) {
    if (image.status === "uploaded") continue;
    onProgress?.(index, { ...image, status: "uploading" });
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(image.file.type) ||
        image.file.size === 0 ||
        image.file.size >= 5 * 1024 * 1024
      )
        throw new Error("Choose a JPEG, PNG, or WebP smaller than 5 MB.");
      if (!image.altText.trim() || image.altText.trim().length > 200)
        throw new Error("Enter an image description of up to 200 characters.");
      const body = new FormData();
      body.set("entityType", target.entityType);
      body.set("entityId", target.entityId);
      if (target.variantId) body.set("variantId", target.variantId);
      body.set("file", image.file);
      body.set("altText", image.altText.trim());
      // The server appends each image and increments the product revision.
      // Wait for completion before starting the next upload.
      const response = await fetch("/api/catalog-images", {
        method: "POST",
        body,
      });
      const result = await boundedJson(response);
      if (
        !response.ok ||
        !result ||
        typeof result !== "object" ||
        !("saved" in result) ||
        result.saved !== true
      )
        throw new Error(
          result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
            ? result.error
            : "Image upload failed. Please retry.",
        );
      results[index] = {
        file: image.file,
        altText: image.altText,
        status: "uploaded",
      };
    } catch (error) {
      results[index] = {
        ...image,
        status: "failed",
        error: error instanceof Error ? error.message : "Image upload failed.",
      };
    }
    onProgress?.(index, results[index]!);
  }
  return results;
}

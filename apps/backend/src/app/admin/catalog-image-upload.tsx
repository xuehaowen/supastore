"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@supastore/ui/input";
import { Button } from "@supastore/ui/button";
import { Label } from "@supastore/ui/label";
import { NativeSelect } from "@supastore/ui/native-select";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import {
  uploadCatalogImages,
  type CatalogImageSelection,
} from "./catalog-image-batch";
export function CatalogImageUpload({
  entityId,
  entityType,
  variants = [],
}: {
  entityId: string;
  entityType: "product" | "collection";
  variants?: { id: string; title: string }[];
}) {
  const router = useRouter(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [images, setImages] = useState<CatalogImageSelection[]>([]),
    inFlight = useRef(false);
  const failed = images.some((image) => image.status === "failed");
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current) return;
        const form = event.currentTarget;
        const variantId = String(new FormData(form).get("variantId") || "");
        inFlight.current = true;
        setBusy(true);
        setMessage("");
        try {
          const results = await uploadCatalogImages(
            { entityId, entityType, ...(variantId ? { variantId } : {}) },
            images,
            (index, image) =>
              setImages((current) =>
                current.map((item, i) => (i === index ? image : item)),
              ),
          );
          const uploaded = results.filter(
            (image) => image.status === "uploaded",
          ).length;
          if (uploaded === results.length) {
            setMessage(
              uploaded === 1
                ? "Image uploaded."
                : `${uploaded} images uploaded.`,
            );
            form.reset();
            setImages([]);
          } else {
            setMessage(
              `${uploaded} of ${results.length} images uploaded. Review the errors and retry failed images.`,
            );
          }
          if (uploaded) router.refresh();
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Image upload failed.");
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="entityType" value={entityType} />
      <Label>
        Image file
        <Input
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/webp"
          multiple={entityType === "product"}
          onChange={(event) => {
            setImages(
              Array.from(event.target.files ?? [], (file) => ({
                file,
                altText: "",
                status: "pending",
              })),
            );
            setMessage("");
          }}
          required
          disabled={busy}
        />
      </Label>
      {images.map((image, index) => (
        <div key={index} className="grid gap-2">
          <Label>
            {images.length === 1
              ? "Image description"
              : `Image description for ${image.file.name}`}
            <Input
              value={image.altText}
              maxLength={200}
              required
              disabled={busy || image.status === "uploaded"}
              onChange={(event) => {
                const altText = event.target.value;
                setImages((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, altText } : item,
                  ),
                );
              }}
            />
          </Label>
          <p className="text-sm" role="status">
            {image.file.name}:{" "}
            {image.status === "uploaded"
              ? "Uploaded"
              : image.status === "uploading"
                ? "Uploading…"
                : (image.error ?? "Ready to upload")}
          </p>
        </div>
      ))}
      {variants.length > 0 && (
        <Label>
          Apply image to
          <NativeSelect name="variantId" disabled={busy}>
            <option value="">Whole product</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </NativeSelect>
        </Label>
      )}
      <p className="text-sm text-muted-foreground">
        JPEG, PNG, or WebP smaller than 5 MB. Describe the image for people
        using screen readers.
        {entityType === "product" &&
          " Select up to 20 images, with a separate description for each. The selected variant applies to all files."}
      </p>
      <Button type="submit" disabled={busy}>
        {busy
          ? "Uploading…"
          : failed
            ? "Retry failed images"
            : images.length > 1
              ? "Upload images"
              : "Upload image"}
      </Button>
      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

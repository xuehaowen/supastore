"use client";
import {
  boundedJson,
  deadlineFetch as fetch,
} from "@/infrastructure/http/bounded-json";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
    [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch("/api/catalog-images", {
            method: "POST",
            body: new FormData(form),
          });
          const result = await boundedJson(response);
          if (!response.ok)
            throw new Error(
              result &&
                typeof result === "object" &&
                "error" in result &&
                typeof result.error === "string"
                ? result.error
                : "Image upload failed.",
            );
          setMessage("Image uploaded.");
          form.reset();
          router.refresh();
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Image upload failed.");
        } finally {
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
          required
          disabled={busy}
        />
      </Label>
      <Label>
        Image description
        <Input name="altText" maxLength={200} required disabled={busy} />
      </Label>
      {variants.length > 0 && (
        <Label>
          Apply image to
          <NativeSelect name="variantId">
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
      </p>
      <Button type="submit" disabled={busy}>
        {busy ? "Uploading…" : "Upload image"}
      </Button>
      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

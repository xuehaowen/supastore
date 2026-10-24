"use client";

import { useEffect, useState, type RefObject } from "react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@supastore/ui/sheet";
import { Button } from "@supastore/ui/button";
import { textFor } from "@supastore/i18n/messages";

export default function ProductImageZoom({
  open,
  onOpenChange,
  triggerRef,
  images,
  index,
  title,
  locale,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  images: { s3Key: string; altText: string | null }[];
  index: number;
  title: string;
  locale: string;
  onNavigate: (offset: number) => void;
}) {
  const [enlarged, setEnlarged] = useState(false);
  useEffect(() => setEnlarged(false), [index, open]);
  const image = images[index];
  const m = textFor(locale);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        finalFocus={triggerRef}
        closeLabel={m.design.close}
        className="product-zoom-dialog"
      >
        <SheetTitle className="pr-12 text-lg font-medium">{title}</SheetTitle>
        <SheetDescription className="sr-only">
          {m.ui.imageZoomHelp}
        </SheetDescription>
        <div
          className="product-zoom-image"
          tabIndex={0}
          aria-label={m.ui.productImageGallery}
        >
          {image && (
            <Image
              src={`/api/assets?key=${encodeURIComponent(image.s3Key)}&inline=1`}
              alt={image.altText || title}
              width={1600}
              height={1600}
              sizes={enlarged ? "180vw" : "90vw"}
              className={
                enlarged ? "product-zoom-enlarged" : "product-zoom-fit"
              }
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {images.length > 1 && (
            <Button
              type="button"
              variant="outline"
              aria-label={m.design.previousPhoto}
              onClick={() => onNavigate(-1)}
            >
              ←
            </Button>
          )}
          <span role="status">
            {m.design.photo} {index + 1} / {images.length}
          </span>
          {images.length > 1 && (
            <Button
              type="button"
              variant="outline"
              aria-label={m.design.nextPhoto}
              onClick={() => onNavigate(1)}
            >
              →
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            aria-pressed={enlarged}
            onClick={() => setEnlarged((value) => !value)}
          >
            {enlarged ? m.ui.zoomOut : m.ui.zoomIn}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

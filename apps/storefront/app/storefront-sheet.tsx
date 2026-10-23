"use client";

import type { ReactNode, RefObject } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@supastore/ui/sheet";

export default function StorefrontSheet({
  open,
  onOpenChange,
  triggerRef,
  title,
  description,
  closeLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  title: string;
  description: string;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent finalFocus={triggerRef} closeLabel={closeLabel}>
        <SheetTitle className="pr-10 font-serif text-3xl">{title}</SheetTitle>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}

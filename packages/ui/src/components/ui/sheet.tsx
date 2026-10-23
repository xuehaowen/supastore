"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@supastore/ui/utils";

const Sheet = Dialog.Root;
const SheetTrigger = Dialog.Trigger;
const SheetClose = Dialog.Close;
const SheetTitle = Dialog.Title;
const SheetDescription = Dialog.Description;

function SheetContent({
  className,
  children,
  closeLabel = "Close",
  ...props
}: Dialog.Popup.Props & { closeLabel?: string }) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-xs transition-opacity duration-200 motion-reduce:transition-none data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <Dialog.Popup
        data-slot="sheet"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(90vw,26rem)] flex-col gap-6 overflow-y-auto border-l bg-background p-6 text-foreground shadow-xl transition-transform duration-200 motion-reduce:transition-none data-ending-style:translate-x-full data-starting-style:translate-x-full",
          className,
        )}
        {...props}
      >
        {children}
        <Dialog.Close
          aria-label={closeLabel}
          className="absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-5" />
        </Dialog.Close>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetTitle,
  SheetDescription,
  SheetContent,
};

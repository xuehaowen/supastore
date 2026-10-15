"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@supastore/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@supastore/ui/dialog";

export function AdminDialog({
  trigger,
  defaultOpen = false,
  inline = false,
  title,
  description,
  children,
  onOpenChange,
}: {
  trigger?: string;
  defaultOpen?: boolean;
  inline?: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (inline) return children;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    >
      {trigger && (
        <DialogTrigger
          render={(props) => (
            <Button {...props} type="button">
              {trigger}
            </Button>
          )}
        />
      )}
      <DialogPopup className="admin-workspace admin-dialog-theme flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="admin-dialog-body mt-2 shrink-0">{children}</div>
      </DialogPopup>
    </Dialog>
  );
}

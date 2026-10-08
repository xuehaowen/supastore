"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function AdminDialog({
  trigger,
  defaultOpen = false,
  inline = false,
  title,
  description,
  children,
}: {
  trigger?: string;
  defaultOpen?: boolean;
  inline?: boolean;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (inline) return children;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger
          render={(props) => (
            <Button {...props} type="button">
              {trigger}
            </Button>
          )}
        />
      )}
      <DialogPopup className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="admin-dialog-body mt-2">{children}</div>
      </DialogPopup>
    </Dialog>
  );
}

"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminDialog({
  trigger,
  title,
  description,
  children,
}: {
  trigger: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      triggerRef.current?.focus();
    };
  }, [open]);
  return (
    <>
      <Button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      {open && (
        <div
          className="admin-dialog-backdrop"
          onMouseDown={() => setOpen(false)}
        >
          <section
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2 id={titleId}>{title}</h2>
                {description && <p>{description}</p>}
              </div>
              <Button
                ref={closeRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Close ${title}`}
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" />
              </Button>
            </header>
            <div className="admin-dialog-body">{children}</div>
          </section>
        </div>
      )}
    </>
  );
}

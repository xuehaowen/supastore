"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || inline) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => {
      document.removeEventListener("keydown", handleKeyboard);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [inline, open]);
  if (inline) return children;
  return (
    <>
      {trigger && (
        <Button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
          {trigger}
        </Button>
      )}
      {open && (
        <div
          className="admin-dialog-backdrop"
          onMouseDown={() => setOpen(false)}
        >
          <section
            ref={dialogRef}
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

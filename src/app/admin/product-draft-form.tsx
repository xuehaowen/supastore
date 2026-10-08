"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ProductDraftForm({
  action,
  productId,
  failed,
  saved,
  children,
}: {
  action: (form: FormData) => Promise<void>;
  productId: string;
  failed: boolean;
  saved: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const [restored, setRestored] = useState(false);
  const key = `product-draft:${productId}`;
  const signature = () =>
    Array.from(ref.current?.elements || [])
      .filter(
        (element): element is HTMLInputElement =>
          element instanceof HTMLInputElement &&
          (element.name === "quoteVersion" ||
            /^(variantId|imageId)-/.test(element.name)),
      )
      .map((element) => `${element.name}:${element.value}`)
      .join("|");
  useEffect(() => {
    try {
      if (saved) sessionStorage.removeItem(key);
      if (!failed) return;
      const stored = JSON.parse(sessionStorage.getItem(key) || "null") as {
        signature?: string;
        values?: Record<string, string | string[]>;
      } | null;
      if (!stored || stored.signature !== signature()) return;
      const draft = stored.values;
      if (!draft || typeof draft !== "object" || Array.isArray(draft)) return;
      for (const element of Array.from(ref.current?.elements || [])) {
        if (
          element instanceof HTMLInputElement &&
          element.type === "checkbox" &&
          ["taxable", "rewardEligible"].includes(element.name)
        ) {
          element.checked = draft[element.name] === "true";
          continue;
        }
        if (
          element instanceof HTMLInputElement &&
          element.type === "checkbox" &&
          element.name === "categoryIds"
        ) {
          const selected = draft.categoryIds;
          if (
            Array.isArray(selected) &&
            selected.every((value) => typeof value === "string")
          )
            element.checked = selected.includes(element.value);
          continue;
        }
        if (element instanceof HTMLSelectElement) {
          const selected = draft[element.name];
          if (
            Array.isArray(selected) &&
            selected.every((value) => typeof value === "string")
          ) {
            for (const option of Array.from(element.options))
              option.selected = selected.includes(option.value);
          }
          continue;
        }
        if (!(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ))
          continue;
        if (
          element instanceof HTMLInputElement &&
          ["hidden", "checkbox", "radio", "file"].includes(element.type)
        )
          continue;
        const value = draft[element.name];
        if (typeof value === "string") element.value = value;
      }
      setDirty(true);
      setRestored(true);
    } catch {
      /* Browser storage is optional; saving still works. */
    }
  }, [failed, saved, key]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <form
      ref={ref}
      action={action}
      className="product-editor"
      onInput={() => setDirty(true)}
      onChange={() => setDirty(true)}
      onSubmit={() => {
        const draft: Record<string, string | string[]> = {};
        for (const element of Array.from(ref.current?.elements || []))
          if (
            element instanceof HTMLInputElement &&
            element.type === "checkbox" &&
            ["taxable", "rewardEligible"].includes(element.name)
          )
            draft[element.name] = String(element.checked);
        draft.categoryIds = Array.from(ref.current?.elements || [])
          .filter(
            (element): element is HTMLInputElement =>
              element instanceof HTMLInputElement &&
              element.type === "checkbox" &&
              element.name === "categoryIds" &&
              element.checked,
          )
          .map((element) => element.value);
        for (const element of Array.from(ref.current?.elements || [])) {
          if (element instanceof HTMLSelectElement) {
            if (element.name)
              draft[element.name] = Array.from(element.selectedOptions).map(
                (option) => option.value,
              );
            continue;
          }
          if (!(
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement
          ))
            continue;
          if (
            element instanceof HTMLInputElement &&
            ["hidden", "checkbox", "radio", "file"].includes(element.type)
          )
            continue;
          if (element.name) draft[element.name] = element.value;
        }
        try {
          sessionStorage.setItem(
            key,
            JSON.stringify({ signature: signature(), values: draft }),
          );
        } catch {
          /* Storage may be unavailable. */
        }
        setDirty(false);
      }}
    >
      {dirty && (
        <Alert className="product-editor-wide">
          <AlertDescription>
            {restored
              ? "Your text edits were restored after the error. Category selections were restored where still available. Review before saving."
              : "You have unsaved changes."}
          </AlertDescription>
        </Alert>
      )}
      {children}
    </form>
  );
}

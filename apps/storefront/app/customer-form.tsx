"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Input } from "@supastore/ui/input";
import { NativeSelect } from "@supastore/ui/native-select";
import { textFor } from "@supastore/i18n/messages";
import { customerValidationMessage } from "../lib/customer-validation";
import { Notice } from "./components";

const Validation = createContext<Record<string, string>>({});
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function CustomerForm({
  children,
  locale,
  error,
  requestId,
  fieldErrors,
  busy = false,
  onSubmit,
  onChange,
  ...props
}: ComponentProps<"form"> & {
  locale: string;
  error?: string | undefined;
  requestId?: string | undefined;
  fieldErrors?: Record<string, string> | undefined;
  busy?: boolean;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const summary = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (fieldErrors) setErrors(fieldErrors);
  }, [fieldErrors]);
  useEffect(() => {
    if (!error || busy) return;
    const frame = requestAnimationFrame(() => {
      const name = Object.keys(fieldErrors ?? {})[0];
      const target = name ? form.current?.elements.namedItem(name) : null;
      if (target instanceof HTMLElement) target.focus();
      else summary.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [error, busy, fieldErrors]);
  return (
    <Validation.Provider value={errors}>
      <form
        {...props}
        ref={form}
        noValidate
        aria-busy={busy}
        onChange={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLTextAreaElement
          )
            setErrors((current) => {
              const next = { ...current };
              delete next[target.name];
              return next;
            });
          onChange?.(event);
        }}
        onSubmit={(event) => {
          const fields = Array.from(event.currentTarget.elements).filter(
            (field): field is Field =>
              field instanceof HTMLInputElement ||
              field instanceof HTMLSelectElement ||
              field instanceof HTMLTextAreaElement,
          );
          const invalid = fields.filter(
            (field) => field.willValidate && !field.validity.valid,
          );
          const next: Record<string, string> = {};
          for (const field of invalid)
            next[field.name] = customerValidationMessage(
              field.validity,
              locale,
              field.type,
            );
          const password = fields.find((field) => field.name === "password");
          const confirmation = fields.find(
            (field) => field.name === "confirmation",
          );
          if (
            password &&
            confirmation?.value &&
            password.value !== confirmation.value
          ) {
            next.confirmation = textFor(locale).auth.passwordsDoNotMatch;
            if (!invalid.includes(confirmation)) invalid.push(confirmation);
          }
          const date = fields.find((field) => field.name === "pickupDate");
          if (date && !date.value)
            next.pickupDate = textFor(locale).form.chooseDate;
          setErrors(next);
          if (Object.keys(next).length) {
            event.preventDefault();
            const first =
              invalid[0] ??
              event.currentTarget.querySelector<HTMLButtonElement>(
                ".pickup-calendar-day-btn:not(:disabled)",
              );
            requestAnimationFrame(() => (first ?? summary.current)?.focus());
            return;
          }
          if (busy) {
            event.preventDefault();
            return;
          }
          onSubmit?.(event);
        }}
      >
        <div ref={summary} tabIndex={-1} className="customer-form-summary">
          <Notice error={error} locale={locale} requestId={requestId} />
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {textFor(locale).form.checkFields}
            </p>
          )}
        </div>
        {children}
      </form>
    </Validation.Provider>
  );
}

export function CustomerInput(props: ComponentProps<typeof Input>) {
  const id = useId();
  const error = useContext(Validation)[props.name ?? ""];
  const errorId = `${id}-error`;
  return (
    <>
      <Input
        {...props}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={
          [props["aria-describedby"], error ? errorId : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {error && (
        <span id={errorId} className="customer-field-error" aria-hidden="true">
          {error}
        </span>
      )}
    </>
  );
}

export function CustomerSelect(props: ComponentProps<typeof NativeSelect>) {
  const id = useId();
  const error = useContext(Validation)[props.name ?? ""];
  const errorId = `${id}-error`;
  return (
    <>
      <NativeSelect
        {...props}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={
          [props["aria-describedby"], error ? errorId : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {error && (
        <span id={errorId} className="customer-field-error" aria-hidden="true">
          {error}
        </span>
      )}
    </>
  );
}

export function CustomerFieldError({ name }: { name: string }) {
  const error = useContext(Validation)[name];
  return error ? <span className="customer-field-error">{error}</span> : null;
}

export function CustomerCheckbox({
  label,
  ...props
}: ComponentProps<"input"> & { label: string }) {
  const id = useId();
  const error = useContext(Validation)[props.name ?? ""];
  return (
    <div className="grid gap-2">
      <label className="flex items-start gap-3 font-normal">
        <input
          {...props}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? id : undefined}
        />
        <span>{label}</span>
      </label>
      {error && (
        <span id={id} className="customer-field-error">
          {error}
        </span>
      )}
    </div>
  );
}

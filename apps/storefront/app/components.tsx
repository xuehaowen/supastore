import { useId } from "react";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { Input } from "@supastore/ui/input";
import { Label } from "@supastore/ui/label";
import { textFor } from "@supastore/i18n/messages";
import { customerError } from "@supastore/i18n/customer";

export function Notice({
  error,
  locale,
  requestId,
}: {
  error?: string | undefined;
  locale?: string;
  requestId?: string | undefined;
}) {
  const m = textFor(locale ?? "en").checkoutDetails;
  return error ? (
    <Alert variant="destructive" className="mb-6">
      <AlertDescription>
        <strong className="font-medium">{m.errorHeading}</strong>{" "}
        {locale ? customerError(error, locale) : error} {m.errorRetry}
        {requestId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            requestId,
          ) && (
            <span className="block">
              {textFor(locale ?? "en").customerCopy.errorReference}: {requestId}
            </span>
          )}
      </AlertDescription>
    </Alert>
  ) : null;
}

export function Field({
  label,
  name,
  type = "text",
  value,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number | undefined;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
      />
    </div>
  );
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

import { useId } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { textFor } from "@/i18n/messages";
import { customerError } from "@/i18n/customer";

export function Notice({
  error,
  locale,
}: {
  error?: string | undefined;
  locale?: string;
}) {
  const m = textFor(locale ?? "en").checkoutDetails;
  return error ? (
    <Alert variant="destructive" className="mb-6">
      <AlertDescription>
        <strong className="font-medium">{m.errorHeading}</strong>{" "}
        {locale ? customerError(error, locale) : error} {m.errorRetry}
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

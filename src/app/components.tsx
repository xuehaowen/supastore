import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Notice({ error }: { error?: string | undefined }) {
  return error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
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
  const id = `field-${name}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} defaultValue={value} required={required} />
    </div>
  );
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export function AdminNav() {
  return (
    <nav className="mb-10 flex flex-wrap gap-x-6 gap-y-3 border-b pb-5 text-sm" aria-label="Admin">
      <Link href="/admin">Daily queue</Link>
      <Link href="/admin/products">Products</Link>
      <Link href="/admin/setup">Store setup</Link>
      <Link href="/">View shop ↗</Link>
    </nav>
  );
}

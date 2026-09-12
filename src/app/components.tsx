import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Notice({ error }: { error?: string | undefined }) {
  return error ? (
    <Alert variant="destructive" className="mb-6">
      <AlertDescription>
        <strong className="font-medium">We couldn’t complete that yet.</strong>{" "}
        {error} Please review the details and try again.
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
    <nav className="admin-nav" aria-label="Admin">
      <Link href="/admin" className="admin-brand">SupaStore <span>ADMIN</span></Link>
      <div className="admin-links">
        <Link href="/admin">Daily queue</Link>
        <Link href="/admin/products">Products</Link>
        <Link href="/admin/setup">Store setup</Link>
        <Link href="/" className="admin-shop-link">View shop ↗</Link>
      </div>
    </nav>
  );
}

import Link from "next/link";
export function Notice({ error }: { error?: string | undefined }) {
  return error ? (
    <p className="notice error" role="alert">
      {error}
    </p>
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
  return (
    <label>
      {label}
      <input name={name} type={type} defaultValue={value} required={required} />
    </label>
  );
}
export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
export function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin">
      <Link href="/admin">Daily queue</Link>
      <Link href="/admin/products">Products</Link>
      <Link href="/admin/setup">Store setup</Link>
      <Link href="/">View shop ↗</Link>
    </nav>
  );
}

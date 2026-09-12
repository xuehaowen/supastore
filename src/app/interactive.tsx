"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}
export function Uploader({ orderId }: { orderId: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const file = new FormData(form).get("file") as File;
        setBusy(true);
        setMessage("Uploading…");
        try {
          const response = await fetch("/api/evidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, mime: file.type, size: file.size }),
          });
          const intent = await response.json();
          if (!response.ok) throw new Error(intent.error);
          const upload = await fetch(intent.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!upload.ok) throw new Error("Upload interrupted. Please retry.");
          const finalized = await fetch("/api/evidence", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, intentId: intent.intentId }),
          });
          if (!finalized.ok) throw new Error((await finalized.json()).error);
          setMessage("Evidence received. This is not a payment receipt.");
          form.reset();
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Upload failed. Please retry.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-2">
      <Label>
        Payment image (JPEG, PNG, WebP, under 5 MB)
        <Input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          required
        />
      </Label></div>
      <Button type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload evidence"}</Button>
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
export function AuthForm() {
  const [message, setMessage] = useState("");
  return (
    <form className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const response = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: fields.get("email"),
            password: fields.get("password"),
          }),
        });
        if (response.ok) window.location.href = "/admin/setup";
        else setMessage("Sign-in failed. Check your details and try again.");
      }}
    >
      <div className="grid gap-2"><Label>
        Email
        <Input type="email" name="email" required autoComplete="email" />
      </Label></div>
      <div className="grid gap-2"><Label>
        Password
        <Input
          type="password"
          name="password"
          minLength={12}
          required
          autoComplete="current-password"
        />
      </Label></div>
      <Button type="submit">Sign in</Button>
      {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
    </form>
  );
}

export function LanguageLink({ locale }: { locale: string }) {
  const pathname = usePathname();
  return (
    <Link
      href={pathname.replace(
        /^\/(en|zh)(?=\/|$)/,
        locale === "en" ? "/zh" : "/en",
      )}
    >
      {locale === "en" ? "中文" : "English"}
    </Link>
  );
}

export function VariantFields() {
  const [count, setCount] = useState(1);
  return (
    <>
      <input type="hidden" name="variantCount" value={count} />
      {Array.from({ length: count }, (_, i) => (
        <fieldset className="grid gap-4 rounded-lg border p-4" key={i}>
          <legend>Variant {i + 1}</legend>
          <div className="grid gap-2"><Label>
            SKU
            <Input name={"sku-" + i} required />
          </Label></div>
          <div className="grid gap-2"><Label>
            Variant name
            <Input name={"variantTitle-" + i} required defaultValue="Default" />
          </Label></div>
          <div className="grid gap-2"><Label>
            Price in minor units
            <Input
              name={"price-" + i}
              type="number"
              min="0"
              step="1"
              required
            />
          </Label></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>
              Color
              <Input name={"color-" + i} />
            </Label></div>
            <div className="grid gap-2"><Label>
              Size
              <Input name={"size-" + i} />
            </Label></div>
          </div>
        </fieldset>
      ))}
      <Button
        variant="outline"
        type="button"
        disabled={count >= 50}
        onClick={() => setCount(count + 1)}
      >
        Add variant
      </Button>
    </>
  );
}

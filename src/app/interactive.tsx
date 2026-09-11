"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="secondary"
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
    </button>
  );
}
export function Uploader({ orderId }: { orderId: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
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
      <label>
        Payment image (JPEG, PNG, WebP, under 5 MB)
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          required
        />
      </label>
      <button disabled={busy}>{busy ? "Uploading…" : "Upload evidence"}</button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
export function AuthForm() {
  const [message, setMessage] = useState("");
  const [register, setRegister] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const response = await fetch(
          "/api/auth/" + (register ? "sign-up/email" : "sign-in/email"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: fields.get("email"),
              password: fields.get("password"),
              name: fields.get("name"),
            }),
          },
        );
        if (response.ok) window.location.href = "/admin/setup";
        else setMessage("Sign-in failed. Check your details and try again.");
      }}
    >
      {register && (
        <label>
          Name
          <input name="name" required />
        </label>
      )}
      <label>
        Email
        <input type="email" name="email" required autoComplete="email" />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          minLength={12}
          required
          autoComplete={register ? "new-password" : "current-password"}
        />
      </label>
      <button>{register ? "Create account" : "Sign in"}</button>
      <button
        type="button"
        className="text-button"
        onClick={() => setRegister(!register)}
      >
        {register
          ? "Already have an account?"
          : "First visit? Create your account"}
      </button>
      <p role="alert">{message}</p>
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
        <fieldset key={i}>
          <legend>Variant {i + 1}</legend>
          <label>
            SKU
            <input name={"sku-" + i} required />
          </label>
          <label>
            Variant name
            <input name={"variantTitle-" + i} required defaultValue="Default" />
          </label>
          <label>
            Price in minor units
            <input
              name={"price-" + i}
              type="number"
              min="0"
              step="1"
              required
            />
          </label>
          <div className="two-col">
            <label>
              Color
              <input name={"color-" + i} />
            </label>
            <label>
              Size
              <input name={"size-" + i} />
            </label>
          </div>
        </fieldset>
      ))}
      <button
        className="secondary"
        type="button"
        disabled={count >= 50}
        onClick={() => setCount(count + 1)}
      >
        Add variant
      </button>
    </>
  );
}

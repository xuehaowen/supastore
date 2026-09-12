"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function signOutSession() {
  return fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}
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
          const upload = await fetch(`/api/evidence/upload?orderId=${encodeURIComponent(orderId)}&intentId=${encodeURIComponent(intent.intentId)}`, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!upload.ok) {
            const failure = await upload.json().catch(() => null);
            throw new Error(failure?.error ?? "Upload interrupted. Please retry.");
          }
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

export function SessionVerificationGuard() {
  useEffect(() => {
    void signOutSession().then((response) => {
      if (response.ok) window.location.reload();
    });
  }, []);
  return null;
}
export function AuthForm({
  audience = "admin",
  locale = "en",
}: {
  audience?: "admin" | "customer";
  locale?: string;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isCustomer = audience === "customer";
  const destination = isCustomer ? `/${locale}/account` : "/admin";
  return (
    <form className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = new FormData(form);
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch(
            mode === "sign-up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: fields.get("name"),
                email: fields.get("email"),
                password: fields.get("password"),
                callbackURL: destination,
              }),
            },
          );
          const payload = (await response.json().catch(() => null)) as
            | {
                message?: string;
                error?: { message?: string };
                user?: { emailVerified?: boolean };
              }
            | null;
          if (!response.ok) {
            const reason = payload?.error?.message ?? payload?.message ?? "";
            throw new Error(
              isCustomer && /verif/i.test(reason)
                ? "Please verify your email before signing in. Check your inbox or spam folder for the verification link."
                : reason ||
                "We couldn't sign you in. Please check your details and try again.",
            );
          }
          if (mode === "sign-up") {
            setMessage(
              "Account created. Check your inbox to verify your email, then come back to sign in.",
            );
            setMode("sign-in");
            form.reset();
            return;
          }
          if (isCustomer && payload?.user?.emailVerified === false) {
            await signOutSession();
            throw new Error(
              "Please verify your email before signing in. Check your inbox or spam folder for the verification link.",
            );
          }
          window.location.assign(destination);
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Something went wrong. Please try again in a moment.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {isCustomer && (
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1" aria-label="Account action">
          <Button type="button" variant={mode === "sign-in" ? "secondary" : "ghost"} onClick={() => { setMode("sign-in"); setMessage(""); }}>
            Sign in
          </Button>
          <Button type="button" variant={mode === "sign-up" ? "secondary" : "ghost"} onClick={() => { setMode("sign-up"); setMessage(""); }}>
            Create account
          </Button>
        </div>
      )}
      {mode === "sign-up" && (
        <div className="grid gap-2">
          <Label htmlFor="name"><UserRound className="mr-1 inline size-3.5" />Name</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
      )}
      <div className="grid gap-2"><Label className="auth-field-label" htmlFor="auth-email"><span><Mail className="mr-1 inline size-3.5" />Email</span></Label>
        <Input id="auth-email" type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
      </div>
      <div className="grid gap-2"><Label className="auth-field-label" htmlFor="auth-password"><span><LockKeyhole className="mr-1 inline size-3.5" />Password</span></Label>
        <Input
          id="auth-password"
          type="password"
          name="password"
          minLength={12}
          required
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <LoaderCircle className="animate-spin" />}
        {busy ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in securely"}
      </Button>
      {isCustomer && mode === "sign-in" && (
        <p className="text-xs leading-5 text-muted-foreground">
          For your security, only verified email addresses can sign in.
        </p>
      )}
      {message && <Alert variant={message.startsWith("Account created") ? "default" : "destructive"}><AlertDescription>{message}</AlertDescription></Alert>}
    </form>
  );
}

export function SignOutButton({ locale }: { locale: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const response = await signOutSession();
          if (response.ok) window.location.assign(`/${locale}`);
          else setBusy(false);
        } catch {
          setBusy(false);
        }
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </Button>
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

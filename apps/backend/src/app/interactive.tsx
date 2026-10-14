"use client";
import { textFor } from "@supastore/i18n/messages";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { customerError } from "@supastore/i18n/customer";
import { LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { Label } from "@supastore/ui/label";
import {
  authenticate,
  signOutSession,
  uploadEvidence,
} from "@/app/client-requests";
export function CopyButton({
  value,
  label,
  locale = "en",
}: {
  value: string;
  label: string;
  locale?: string;
}) {
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
      {copied ? textFor(locale).common.copied : label}
    </Button>
  );
}
export function Uploader({
  orderId,
  locale = "en",
}: {
  orderId: string;
  locale?: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(true);
        setMessage(textFor(locale).common.uploading);
        try {
          const fileValue = new FormData(form).get("file");
          if (!(fileValue instanceof File) || fileValue.size === 0) {
            throw new Error("Choose an image to upload.");
          }
          await uploadEvidence(orderId, fileValue);
          setMessage(textFor(locale).common.evidenceReceived);
          form.reset();
        } catch (error) {
          setMessage(customerError(error, locale));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-2">
        <Label>
          {textFor(locale).common.paymentImage}
          <Input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            required
          />
        </Label>
      </div>
      <Button type="submit" disabled={busy}>
        {busy
          ? textFor(locale).common.uploading
          : textFor(locale).common.uploadEvidence}
      </Button>
      <p
        className="text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </form>
  );
}

export function SessionVerificationGuard() {
  useEffect(() => {
    void signOutSession()
      .then((response) => {
        if (response.ok) window.location.reload();
      })
      .catch(() => {
        // A transient sign-out failure should not create an unhandled rejection.
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
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = new FormData(form);
        setBusy(true);
        setMessage("");
        try {
          const payload = await authenticate(
            mode,
            {
              name: fields.get("name"),
              email: fields.get("email"),
              password: fields.get("password"),
              callbackURL: destination,
            },
            { customer: isCustomer },
          );
          if (mode === "sign-up") {
            setMessage(textFor(locale).common.accountCreated);
            setMode("sign-in");
            form.reset();
            return;
          }
          if (
            isCustomer &&
            payload &&
            typeof payload.user === "object" &&
            payload.user !== null &&
            "emailVerified" in payload.user &&
            payload.user.emailVerified === false
          ) {
            await signOutSession();
            throw new Error(textFor(locale).errors.verifyEmail);
          }
          window.location.assign(destination);
        } catch (error) {
          setMessage(
            isCustomer
              ? customerError(error, locale)
              : error instanceof Error
                ? error.message
                : textFor(locale).errors.generic,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {isCustomer && (
        <div
          className="grid grid-cols-2 rounded-lg bg-muted p-1"
          aria-label={textFor(locale).common.accountAction}
        >
          <Button
            type="button"
            variant={mode === "sign-in" ? "secondary" : "ghost"}
            onClick={() => {
              setMode("sign-in");
              setMessage("");
            }}
          >
            {textFor(locale).auth.signIn}
          </Button>
          <Button
            type="button"
            variant={mode === "sign-up" ? "secondary" : "ghost"}
            onClick={() => {
              setMode("sign-up");
              setMessage("");
            }}
          >
            {textFor(locale).common.createAccount}
          </Button>
        </div>
      )}
      {mode === "sign-up" && (
        <div className="grid gap-2">
          <Label htmlFor="name">
            <UserRound className="mr-1 inline size-3.5" />
            {textFor(locale).profile.name}
          </Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
      )}
      <div className="grid gap-2">
        <Label className="auth-field-label" htmlFor="auth-email">
          <span>
            <Mail className="mr-1 inline size-3.5" />
            {textFor(locale).auth.email}
          </span>
        </Label>
        <Input
          id="auth-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={textFor(locale).common.emailPlaceholder}
        />
      </div>
      <div className="grid gap-2">
        <Label className="auth-field-label" htmlFor="auth-password">
          <span>
            <LockKeyhole className="mr-1 inline size-3.5" />
            {textFor(locale).auth.password}
          </span>
        </Label>
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
        {busy
          ? textFor(locale).common.wait
          : mode === "sign-up"
            ? textFor(locale).common.createAccount
            : textFor(locale).common.signInSecurely}
      </Button>
      {isCustomer && mode === "sign-in" && (
        <p className="text-xs leading-5 text-muted-foreground">
          {textFor(locale).common.verifiedNotice}
        </p>
      )}
      {message && (
        <Alert
          variant={
            message === textFor(locale).common.accountCreated
              ? "default"
              : "destructive"
          }
        >
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
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
      {busy
        ? textFor(locale).common.signingOut
        : textFor(locale).account.signOut}
    </Button>
  );
}

export function LanguageLink({ locale }: { locale: string }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return (
    <Link
      href={
        pathname.replace(
          /^\/(en|zh)(?=\/|$)/,
          locale === "en" ? "/zh" : "/en",
        ) + (query ? `?${query}` : "")
      }
    >
      {textFor(locale).common.languageName}
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
          <div className="grid gap-2">
            <Label>
              SKU
              <Input name={"sku-" + i} required />
            </Label>
          </div>
          <div className="grid gap-2">
            <Label>
              Variant name
              <Input
                name={"variantTitle-" + i}
                required
                defaultValue="Default"
              />
            </Label>
          </div>
          <div className="grid gap-2">
            <Label>
              Price in minor units
              <Input
                name={"price-" + i}
                type="number"
                min="0"
                step="1"
                required
              />
            </Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>
                Color
                <Input name={"color-" + i} />
              </Label>
            </div>
            <div className="grid gap-2">
              <Label>
                Size
                <Input name={"size-" + i} />
              </Label>
            </div>
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

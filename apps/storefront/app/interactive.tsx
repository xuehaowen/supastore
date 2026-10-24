"use client";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@supastore/contracts";
import { textFor } from "@supastore/i18n/messages";
import Link from "next/link";
import { useEffect, useState } from "react";
import { customerError } from "@supastore/i18n/customer";
import { LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@supastore/ui/tabs";
import { Button } from "@supastore/ui/button";
import { CustomerForm, CustomerInput as Input } from "./customer-form";
import { Label } from "@supastore/ui/label";
import {
  authenticate,
  signOutSession,
  uploadEvidence,
} from "./client-requests";
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
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setFailed(false);
          } catch {
            setCopied(false);
            setFailed(true);
          }
        }}
      >
        {copied ? textFor(locale).common.copied : label}
      </Button>
      {failed && (
        <span className="text-sm text-muted-foreground" role="status">
          {textFor(locale).common.copyFailed}
        </span>
      )}
    </span>
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
    <CustomerForm
      locale={locale}
      busy={busy}
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
    </CustomerForm>
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
    <Tabs
      value={mode}
      onValueChange={(value) => {
        setMode(value as "sign-in" | "sign-up");
        setMessage("");
      }}
    >
      <CustomerForm
        locale={locale}
        busy={busy}
        error={
          message && message !== textFor(locale).common.accountCreated
            ? message
            : undefined
        }
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
          <>
            <TabsList aria-label={textFor(locale).common.accountAction}>
              <TabsTrigger value="sign-in">
                {textFor(locale).auth.signIn}
              </TabsTrigger>
              <TabsTrigger value="sign-up">
                {textFor(locale).common.createAccount}
              </TabsTrigger>
            </TabsList>
          </>
        )}
        <TabsContent value={mode} className="grid gap-4 pt-0">
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
              minLength={mode === "sign-up" ? MIN_PASSWORD_LENGTH : undefined}
              maxLength={mode === "sign-up" ? MAX_PASSWORD_LENGTH : undefined}
              required
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
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
          {message && message === textFor(locale).common.accountCreated && (
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
        </TabsContent>
      </CustomerForm>
    </Tabs>
  );
}

export function SignOutButton({ locale }: { locale: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await signOutSession();
            if (response.ok) window.location.assign(`/${locale}`);
            else {
              setBusy(false);
              setError(textFor(locale).ui.signOutFailed);
            }
          } catch {
            setBusy(false);
            setError(textFor(locale).ui.signOutFailed);
          }
        }}
      >
        {busy
          ? textFor(locale).common.signingOut
          : textFor(locale).account.signOut}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </span>
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

"use client";
import { textFor } from "@supastore/i18n/messages";
import { useState } from "react";
import { LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { Label } from "@supastore/ui/label";
import { authenticate } from "@/app/client-requests";
export function AuthForm({ locale = "en" }: { locale?: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const destination = "/admin";
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
          await authenticate({
            email: fields.get("email"),
            password: fields.get("password"),
            callbackURL: destination,
          });
          window.location.assign(destination);
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : textFor(locale).errors.generic,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
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
          : textFor(locale).common.signInSecurely}
      </Button>
      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </form>
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

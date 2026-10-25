"use client";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@supastore/contracts";
import { textFor } from "@supastore/i18n/messages";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@supastore/ui/accordion";
import { Button } from "@supastore/ui/button";
import { CustomerForm, CustomerInput as Input } from "./customer-form";
import { customerAuthRequest } from "./customer-auth-requests";
import { saveProfileAction } from "./customer-actions";
import { customerError } from "@supastore/i18n/customer";

export function CustomerAuthTools({
  locale,
  name,
  phone = "",
  token,
  invalidToken = false,
  reset = false,
}: {
  locale: string;
  name?: string;
  phone?: string;
  token?: string;
  invalidToken?: boolean;
  reset?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (failed) feedback.current?.focus();
  }, [failed, message]);
  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    operation: "profile" | "change" | "forgot" | "verify" | "reset",
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const email = String(data.get("email") || "").trim();
      const password = String(data.get("password") || "");
      if (
        (operation === "change" || operation === "reset") &&
        password !== data.get("confirmation")
      ) {
        throw new Error(textFor(locale).auth.passwordsDoNotMatch);
      }
      if (operation === "profile") await saveProfileAction(data);
      if (operation === "change")
        await customerAuthRequest("change-password", {
          currentPassword: data.get("currentPassword"),
          newPassword: password,
          revokeOtherSessions: true,
        });
      if (operation === "forgot")
        await customerAuthRequest("request-password-reset", {
          email,
          redirectTo: `${window.location.origin}/${locale}/account/reset-password`,
        });
      if (operation === "verify")
        await customerAuthRequest("send-verification-email", {
          email,
          callbackURL: `${window.location.origin}/${locale}/account`,
        });
      if (operation === "reset") {
        if (!token || invalidToken)
          throw new Error(textFor(locale).ui.thisLinkIsInvalidRequestANewOne);
        await customerAuthRequest("reset-password", {
          token,
          newPassword: password,
        });
        setDone(true);
      }
      setMessage(
        operation === "forgot" || operation === "verify"
          ? textFor(locale).auth.linkSent
          : textFor(locale).auth.saved,
      );
      if (operation === "profile") window.location.reload();
    } catch (error) {
      setFailed(true);
      setMessage(customerError(error, locale));
    } finally {
      setBusy(false);
    }
  }
  const passwords = (
    <>
      <label>
        {textFor(locale).auth.newPassword}
        <Input
          name="password"
          type="password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          autoComplete="new-password"
        />
      </label>
      <label>
        {textFor(locale).auth.confirmPassword}
        <Input
          name="confirmation"
          type="password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          autoComplete="new-password"
        />
      </label>
    </>
  );
  return (
    <div className="grid gap-5">
      {message && (
        <p ref={feedback} tabIndex={-1} role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
      {reset ? (
        <>
          {(!token || invalidToken) && (
            <p role="alert">
              {textFor(locale).ui.thisResetLinkIsInvalidOrExpired}
            </p>
          )}
          {token && !invalidToken && !done && (
            <CustomerForm
              locale={locale}
              busy={busy}
              className="grid gap-3"
              onSubmit={(e) => submit(e, "reset")}
            >
              {passwords}
              <Button type="submit" disabled={busy}>
                {busy
                  ? textFor(locale).common.wait
                  : textFor(locale).auth.resetPassword}
              </Button>
            </CustomerForm>
          )}
          <Link href={`/${locale}/account`}>
            {textFor(locale).auth.returnToSignIn}
          </Link>
        </>
      ) : name !== undefined ? (
        <>
          <CustomerForm
            locale={locale}
            busy={busy}
            className="grid gap-3"
            onSubmit={(e) => submit(e, "profile")}
          >
            <label>
              {textFor(locale).profile.name}
              <Input
                name="name"
                required
                maxLength={100}
                defaultValue={name}
                autoComplete="name"
              />
            </label>
            <label>
              {textFor(locale).profile.phone}
              <Input
                name="phone"
                type="tel"
                maxLength={32}
                defaultValue={phone}
                autoComplete="tel"
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy
                ? textFor(locale).common.wait
                : textFor(locale).profile.saveProfile}
            </Button>
          </CustomerForm>
          <details>
            <summary>{textFor(locale).auth.changePassword}</summary>
            <CustomerForm
              locale={locale}
              busy={busy}
              className="grid gap-3 mt-3"
              onSubmit={(e) => submit(e, "change")}
            >
              <label>
                {textFor(locale).auth.currentPassword}
                <Input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              {passwords}
              <Button type="submit" disabled={busy}>
                {busy
                  ? textFor(locale).common.wait
                  : textFor(locale).auth.changePassword}
              </Button>
            </CustomerForm>
          </details>
        </>
      ) : (
        <>
          <Accordion>
            {" "}
            {(["forgot", "verify"] as const).map((operation) => (
              <AccordionItem key={operation} value={operation}>
                <AccordionTrigger>
                  {operation === "forgot"
                    ? textFor(locale).auth.forgotPassword
                    : textFor(locale).auth.resendVerification}
                </AccordionTrigger>
                <AccordionContent>
                  <CustomerForm
                    locale={locale}
                    busy={busy}
                    className="grid gap-3 mt-3"
                    onSubmit={(e) => submit(e, operation)}
                  >
                    <label>
                      {operation === "forgot"
                        ? textFor(locale).ui.emailForPasswordReset
                        : textFor(locale).ui.emailForVerification}
                      <Input
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                      />
                    </label>
                    <Button type="submit" disabled={busy}>
                      {busy
                        ? textFor(locale).common.wait
                        : textFor(locale).auth.sendLink}
                    </Button>
                  </CustomerForm>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </>
      )}
    </div>
  );
}

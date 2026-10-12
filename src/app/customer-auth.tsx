"use client";
import { textFor } from "@/i18n/messages";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customerAuthRequest } from "./customer-auth-requests";
import { saveProfileAction } from "./customer-actions";
import { customerError } from "@/i18n/customer";

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
  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    operation: "profile" | "change" | "forgot" | "verify" | "reset",
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
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
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
        />
      </label>
      <label>
        {textFor(locale).auth.confirmPassword}
        <Input
          name="confirmation"
          type="password"
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
        />
      </label>
    </>
  );
  return (
    <div className="grid gap-5">
      {message && <p role="status">{message}</p>}
      {reset ? (
        <>
          {(!token || invalidToken) && (
            <p role="alert">
              {textFor(locale).ui.thisResetLinkIsInvalidOrExpired}
            </p>
          )}
          {token && !invalidToken && !done && (
            <form className="grid gap-3" onSubmit={(e) => submit(e, "reset")}>
              {passwords}
              <Button type="submit" disabled={busy}>
                {textFor(locale).auth.resetPassword}
              </Button>
            </form>
          )}
          <Link href={`/${locale}/account`}>
            {textFor(locale).auth.returnToSignIn}
          </Link>
        </>
      ) : name !== undefined ? (
        <>
          <form className="grid gap-3" onSubmit={(e) => submit(e, "profile")}>
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
              {textFor(locale).profile.saveProfile}
            </Button>
          </form>
          <details>
            <summary>{textFor(locale).auth.changePassword}</summary>
            <form
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
                {textFor(locale).auth.changePassword}
              </Button>
            </form>
          </details>
        </>
      ) : (
        <>
          {(["forgot", "verify"] as const).map((operation) => (
            <details key={operation}>
              <summary>
                {operation === "forgot"
                  ? textFor(locale).auth.forgotPassword
                  : textFor(locale).auth.resendVerification}
              </summary>
              <form
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
                  {textFor(locale).auth.sendLink}
                </Button>
              </form>
            </details>
          ))}
        </>
      )}
    </div>
  );
}

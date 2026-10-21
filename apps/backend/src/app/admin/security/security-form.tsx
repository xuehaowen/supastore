"use client";
import { useState } from "react";
import { staffFactorRequest } from "@/app/client-requests";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { Label } from "@supastore/ui/label";

export function SecurityForm({
  enabled: initialEnabled,
}: {
  enabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
          if (setup && !confirmed) {
            await staffFactorRequest("verify-totp", {
              code: fields.get("code"),
              trustDevice: false,
            });
            setEnabled(true);
            setConfirmed(true);
            setMessage(
              "Authenticator enabled. Save your recovery codes, then dismiss them.",
            );
          } else if (enabled) {
            await staffFactorRequest("disable", {
              password: fields.get("password"),
            });
            setEnabled(false);
            setSetup(null);
            setConfirmed(false);
            setMessage(
              "Authenticator disabled. Previous staff sessions have been revoked.",
            );
          } else {
            const result = await staffFactorRequest("enable", {
              password: fields.get("password"),
              method: "totp",
            });
            if (
              typeof result?.totpURI !== "string" ||
              !Array.isArray(result.backupCodes)
            )
              throw new Error("Unable to start authenticator enrollment.");
            setSetup({
              uri: result.totpURI,
              codes: result.backupCodes as string[],
            });
          }
          form.reset();
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to update account security.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Authenticator: <strong>{enabled ? "Enabled" : "Not enabled"}</strong>
      </p>
      {setup && (
        <section className="grid gap-3 rounded border p-4">
          {!confirmed && (
            <>
              <p>
                Add a time-based account in your authenticator using this
                secret:
              </p>
              <code className="break-all select-all">
                {new URL(setup.uri).searchParams.get("secret")}
              </code>
              <Label htmlFor="security-code">Authenticator code</Label>
              <Input
                id="security-code"
                name="code"
                autoComplete="one-time-code"
                required
              />
            </>
          )}
          <p>Single-use recovery codes:</p>
          <pre className="whitespace-pre-wrap break-all select-all">
            {setup.codes.join("\n")}
          </pre>
          {confirmed && (
            <Button
              type="button"
              onClick={() => {
                setSetup(null);
                setConfirmed(false);
              }}
            >
              I saved my recovery codes
            </Button>
          )}
        </section>
      )}
      {!setup && (
        <>
          <Label htmlFor="security-password">Current password</Label>
          <Input
            id="security-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </>
      )}
      {!confirmed && (
        <Button type="submit" disabled={busy}>
          {busy
            ? "Please wait…"
            : setup
              ? "Confirm authenticator"
              : enabled
                ? "Disable authenticator"
                : "Set up authenticator"}
        </Button>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}

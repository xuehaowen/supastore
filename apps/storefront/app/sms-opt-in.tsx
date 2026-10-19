"use client";
import { useState } from "react";
import Link from "next/link";
import { textFor } from "@supastore/i18n/messages";
import { customerError } from "@supastore/i18n/customer";
import { smsDisclosure } from "@supastore/contracts";
import { fetchJson } from "../lib/fetch-json";
import { responseMessage } from "../lib/response";
import { Input } from "@supastore/ui/input";
import { Button } from "@supastore/ui/button";

export type SmsOptInProps = {
  storeName: string;
  locale: string;
  available: boolean;
  source: "checkout" | "sms-page";
};
export function SmsOptIn({
  storeName,
  locale,
  available,
  source,
}: SmsOptInProps) {
  const m = textFor(locale).sms;
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const disclosure = smsDisclosure({ storeName }, locale);
  async function submit() {
    if (!consent || !phone || pending) return;
    setPending(true);
    setError("");
    try {
      const { response, data } = await fetchJson("/api/v1/sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: challenge ? "confirm" : "start",
          phone,
          code,
          consent,
          disclosure,
          locale,
          source,
          preferenceId: challenge,
        }),
      });
      if (!response.ok) throw new Error(responseMessage(data, m.error));
      const result = data as {
        data?: { preferenceId?: unknown; verified?: unknown };
      };
      if (
        typeof result?.data?.preferenceId !== "string" ||
        typeof result.data.verified !== "boolean"
      )
        throw new Error("Invalid SMS response.");
      setChallenge(result.data.preferenceId);
      setVerified(result.data.verified);
    } catch (error) {
      setError(customerError(error, locale));
    } finally {
      setPending(false);
    }
  }
  return (
    <fieldset className="grid gap-3 rounded-xl border p-4">
      <legend>{m.legend}</legend>
      <label className="grid gap-2">
        {m.phone}
        <Input
          type="tel"
          autoComplete="tel"
          placeholder="+12025550123"
          maxLength={16}
          value={phone}
          disabled={pending || Boolean(challenge)}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      <label className="flex items-start gap-3 font-normal">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0"
          checked={consent}
          disabled={pending}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>{disclosure}</span>
      </label>
      <p className="flex gap-4 text-sm">
        <Link href={`/${locale}/pages/privacy`}>{m.privacy}</Link>
        <Link href={`/${locale}/pages/terms`}>{m.terms}</Link>
      </p>
      {!available && <p role="status">{m.unavailable}</p>}
      {challenge && !verified && (
        <label className="grid gap-2">
          {m.code}
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
      )}
      {verified && consent ? (
        <p role="status">{m.verified}</p>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={!available || !consent || !phone || pending}
          onClick={() => void submit()}
        >
          {pending ? m.pending : challenge ? m.confirm : m.send}
        </Button>
      )}
      {challenge && !pending && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setChallenge("");
            setVerified(false);
            setCode("");
            setConsent(false);
          }}
        >
          {m.change}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
      {source === "checkout" && (
        <input
          type="hidden"
          name="smsPreferenceId"
          value={verified && consent ? challenge : ""}
        />
      )}
    </fieldset>
  );
}
export function SmsSignupForm(props: Omit<SmsOptInProps, "source">) {
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <SmsOptIn {...props} source="sms-page" />
    </form>
  );
}

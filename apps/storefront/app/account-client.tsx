"use client";
import { useEffect, useState } from "react";
import { ApiError, request } from "../lib/client";
import type { CustomerAccountDto as Account } from "@supastore/contracts";
import type { StorefrontMessages } from "../lib/i18n";

type AccountMessages = Pick<StorefrontMessages, "account" | "auth" | "address">;
type RecoveryMessages = StorefrontMessages["recovery"];
type AuthMessages = Pick<StorefrontMessages, "auth">;

export function AccountClient({
  locale,
  messages,
}: {
  locale: string;
  messages: AccountMessages;
}) {
  const m = messages;
  const [account, setAccount] = useState<Account | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("sign-in");
  async function load() {
    setAccount(await request<Account>("v1/account", undefined, "GET"));
  }
  useEffect(() => {
    let active = true;
    request<Account>("v1/account", undefined, "GET")
      .then((value) => {
        if (active) setAccount(value);
      })
      .catch((error) => {
        if (active && !(error instanceof ApiError && error.status === 401))
          setMessage(m.account.unableToLoad);
      });
    return () => {
      active = false;
    };
  }, [m.account.unableToLoad]);
  return (
    <div className="stack">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await load();
          } catch {
            setMessage(m.account.signInPrompt);
          } finally {
            setBusy(false);
          }
        }}
      >
        {m.account.loadAccount}
      </button>
      {message && <p role="status">{message}</p>}
      {account ? (
        <>
          <p>{account.customer.email}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await request(
                  "v1/account",
                  Object.fromEntries(new FormData(e.currentTarget)),
                  "PATCH",
                );
                await load();
                setMessage(m.account.profileSaved);
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : m.account.profileSaved,
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              {m.account.name}
              <input
                name="name"
                defaultValue={account.customer.name}
                maxLength={100}
                required
              />
            </label>
            <label>
              {m.account.phone}
              <input
                name="phone"
                type="tel"
                defaultValue={account.customer.phone || ""}
                maxLength={32}
              />
            </label>
            <button disabled={busy}>{m.account.saveProfile}</button>
          </form>
          {account.credit && (
            <p>
              {m.account.availableCredit}:{" "}
              {(account.credit.balanceCents - account.credit.reservedCents) /
                10 ** account.credit.precision}{" "}
              {account.credit.currency}
            </p>
          )}
          <h2>{m.account.orderHistory}</h2>
          {account.orders.map((o) => (
            <button
              key={o.id}
              onClick={async () => {
                try {
                  await request("v1/account/orders", { orderId: o.id });
                  window.location.assign(`/${locale}/orders/${o.id}`);
                } catch (e) {
                  setMessage(
                    e instanceof Error ? e.message : m.account.profileSaved,
                  );
                }
              }}
            >
              {o.referenceCode} · {o.lifecycleStatus}
            </button>
          ))}
          <PasswordForm
            locale={locale}
            messages={m.auth}
            onMessage={setMessage}
          />
          <h2>{m.address.title}</h2>
          {[...account.addresses, { id: "", label: "", address: {} }].map(
            (address) => (
              <AddressForm
                key={address.id}
                address={address}
                messages={m.address}
                onSaved={load}
                onMessage={setMessage}
              />
            ),
          )}
          <button
            onClick={async () => {
              try {
                await request("auth/sign-out", {});
                window.location.reload();
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : m.account.profileSaved,
                );
              }
            }}
          >
            {m.account.signOut}
          </button>
        </>
      ) : (
        <>
          <select
            aria-label={m.auth.accountAction}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="sign-in">{m.auth.signIn}</option>
            <option value="sign-up">{m.auth.signUp}</option>
            <option value="forgot">{m.auth.forgotPassword}</option>
            <option value="verify">{m.auth.resendVerification}</option>
          </select>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.currentTarget));
              setBusy(true);
              try {
                const path =
                  mode === "forgot"
                    ? "request-password-reset"
                    : mode === "verify"
                      ? "send-verification-email"
                      : `${mode}/email`;
                await request(`auth/${path}`, {
                  ...body,
                  callbackURL: `${window.location.origin}/${locale}/account`,
                  redirectTo: `${window.location.origin}/${locale}/account/reset-password`,
                });
                if (mode === "sign-in") await load();
                else setMessage(m.auth.checkInboxNotice);
              } catch (e) {
                setMessage(
                  mode === "forgot" || mode === "verify"
                    ? m.auth.unableToSendLink
                    : e instanceof Error
                      ? e.message
                      : m.auth.unableToSendLink,
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === "sign-up" && (
              <label>
                {m.account.name}
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              {m.auth.email}
              <input name="email" type="email" required autoComplete="email" />
            </label>
            {(mode === "sign-in" || mode === "sign-up") && (
              <label>
                {m.auth.password}
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  required
                  autoComplete={
                    mode === "sign-up" ? "new-password" : "current-password"
                  }
                />
              </label>
            )}
            <button disabled={busy}>{m.auth.continue}</button>
          </form>
        </>
      )}
    </div>
  );
}
function AddressForm({
  address,
  messages,
  onSaved,
  onMessage,
}: {
  address: { id: string; label: string; address: Record<string, string> };
  messages: StorefrontMessages["address"];
  onSaved: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const m = messages;
  const fields: [keyof StorefrontMessages["address"], string][] = [
    ["recipientName", "name"],
    ["streetAddress", "line1"],
    ["apartment", "line2"],
    ["city", "city"],
    ["region", "region"],
    ["postalCode", "postalCode"],
    ["countryCode", "country"],
    ["phone", "phone"],
  ];
  return (
    <details>
      <summary>{address.label || m.add}</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const native = e.nativeEvent as SubmitEvent;
          const isRemove =
            (native.submitter as HTMLButtonElement | null)?.value === "remove";
          setBusy(true);
          try {
            await request("v1/account/addresses", {
              ...Object.fromEntries(form),
              ...(address.id ? { id: address.id } : {}),
              remove: isRemove,
            });
            await onSaved();
            onMessage(isRemove ? m.removed : m.saved);
          } catch (error) {
            onMessage(error instanceof Error ? error.message : m.saved);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {m.label}
          <input
            name="label"
            required
            defaultValue={address.label}
            maxLength={80}
          />
        </label>
        {fields.map(([msgKey, fieldKey]) => (
          <label key={fieldKey}>
            {m[msgKey] as string}
            <input
              name={fieldKey}
              defaultValue={address.address[fieldKey] || ""}
              required={!["phone", "line2"].includes(fieldKey)}
              maxLength={200}
            />
          </label>
        ))}
        <button disabled={busy}>{m.save}</button>
        {address.id && (
          <button disabled={busy} value="remove" formNoValidate>
            {m.remove}
          </button>
        )}
      </form>
    </details>
  );
}
function PasswordForm({
  locale,
  messages,
  onMessage,
  token,
}: {
  locale: string;
  messages: StorefrontMessages["auth"];
  onMessage: (v: string) => void;
  token?: string;
}) {
  const m = messages;
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          if (f.get("newPassword") !== f.get("confirmation"))
            throw new Error(m.passwordsDoNotMatch);
          await request(
            `auth/${token ? "reset-password" : "change-password"}`,
            token
              ? { token, newPassword: f.get("newPassword") }
              : {
                  currentPassword: f.get("currentPassword"),
                  newPassword: f.get("newPassword"),
                  revokeOtherSessions: true,
                },
          );
          onMessage(m.passwordUpdated);
          if (token) window.location.assign(`/${locale}/account`);
        } catch (e) {
          onMessage(e instanceof Error ? e.message : m.passwordsDoNotMatch);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!token && (
        <label>
          {m.currentPassword}
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
      )}
      <label>
        {m.newPassword}
        <input
          name="newPassword"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        {m.confirmPassword}
        <input
          name="confirmation"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <button disabled={busy}>{m.updatePassword}</button>
    </form>
  );
}
export function ResetPasswordClient({
  locale,
  messages,
  token,
  error,
}: {
  locale: string;
  messages: AuthMessages;
  token?: string;
  error?: string;
}) {
  const m = messages.auth;
  const [message, setMessage] = useState("");
  return (
    <div className="stack">
      {!token || error ? (
        <p role="alert">{m.linkInvalidOrExpired}</p>
      ) : (
        <PasswordForm
          locale={locale}
          messages={m}
          token={token}
          onMessage={setMessage}
        />
      )}
      <p role="status">{message}</p>
      <a href={`/${locale}/account`}>{m.returnToAccount}</a>
    </div>
  );
}
export function RecoveryClient({
  locale,
  messages,
  token,
}: {
  locale: string;
  messages: RecoveryMessages;
  token?: string;
}) {
  const m = messages;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (token) {
            const result = await request<{ orderId: string }>(
              "v1/recovery",
              { token },
              "PUT",
            );
            window.location.assign(`/${locale}/orders/${result.orderId}`);
          } else {
            await request(
              "v1/recovery",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            setMessage(m.checkEmailNotice);
          }
        } catch (e) {
          setMessage(e instanceof Error ? e.message : m.checkEmailNotice);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!token && (
        <>
          <label>
            {m.email}
            <input name="email" type="email" required />
          </label>
          <label>
            {m.orderReference}
            <input name="reference" required />
          </label>
        </>
      )}
      <button disabled={busy}>{token ? m.openOrder : m.sendLink}</button>
      <p role="status">{message}</p>
    </form>
  );
}

"use client";
import {
  parseCustomerAccountDto,
  parseRecoveryOrderDto,
} from "@supastore/contracts";

import type { CustomerAccountDto as Account } from "@supastore/contracts";
import { useEffect, useState } from "react";
import {
  activityLabel,
  customerError,
  formatMoney,
  statusLabel,
} from "../../../packages/i18n/src/customer";
import { ApiError, request } from "../lib/client";
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
  const [page, setPage] = useState(1);
  const [creditPage, setCreditPage] = useState(1);
  const [reference, setReference] = useState("");
  const [searchReference, setSearchReference] = useState("");
  async function load(
    nextPage = page,
    filter = searchReference,
    nextCreditPage = creditPage,
  ) {
    const value = await request(
      `v1/account?page=${nextPage}&reference=${encodeURIComponent(filter)}&creditPage=${nextCreditPage}`,
      undefined,
      "GET",
      parseCustomerAccountDto,
    );
    setAccount(value);
    setPage(nextPage);
    setCreditPage(nextCreditPage);
    setSearchReference(filter);
  }
  async function changePage(nextPage: number) {
    setBusy(true);
    try {
      await load(nextPage);
    } catch (error) {
      setMessage(customerError(error, locale));
    } finally {
      setBusy(false);
    }
  }
  async function changeCreditPage(nextPage: number) {
    setBusy(true);
    try {
      await load(page, searchReference, nextPage);
    } catch (error) {
      setMessage(customerError(error, locale));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    request("v1/account", undefined, "GET", parseCustomerAccountDto)
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
                setMessage(customerError(e, locale));
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
            <section>
              <p>
                {m.account.availableCredit}:{" "}
                {formatMoney(
                  account.credit.balanceCents - account.credit.reservedCents,
                  account.credit.currency,
                  account.credit.precision,
                  locale,
                )}
              </p>
              <p>
                {m.account.reservedCredit}:{" "}
                {formatMoney(
                  account.credit.reservedCents,
                  account.credit.currency,
                  account.credit.precision,
                  locale,
                )}
              </p>
              <h3>{m.account.recentActivity}</h3>
              {account.credit.entries.map((entry) => (
                <p key={entry.id}>
                  {new Date(entry.createdAt).toLocaleDateString(locale)} ·{" "}
                  {entry.reason
                    ? activityLabel(entry.reason, locale)
                    : m.account.recentActivity}{" "}
                  ·{" "}
                  {formatMoney(
                    entry.amountCents,
                    account.credit!.currency,
                    account.credit!.precision,
                    locale,
                  )}
                </p>
              ))}
              <p>{m.account.creditHelp}</p>
              <nav aria-label={m.account.recentActivity}>
                <button
                  disabled={busy || creditPage === 1}
                  onClick={() => changeCreditPage(creditPage - 1)}
                >
                  {m.account.previous}
                </button>
                <span> {creditPage} </span>
                <button
                  disabled={busy || !account.credit.hasNext}
                  onClick={() => changeCreditPage(creditPage + 1)}
                >
                  {m.account.next}
                </button>
              </nav>
            </section>
          )}
          <h2>{m.account.orderHistory}</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await load(1, reference.trim());
              } catch (error) {
                setMessage(customerError(error, locale));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              {m.account.orderReference}
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={100}
              />
            </label>
            <button disabled={busy}>{m.account.searchOrders}</button>
          </form>
          <a href={`/${locale}/recover`}>{m.account.findOrder}</a>
          {!account.orders.length && <p>{m.account.noOrders}</p>}
          {account.orders.map((o) => (
            <button
              key={o.id}
              onClick={async () => {
                try {
                  await request("v1/account/orders", { orderId: o.id });
                  window.location.assign(`/${locale}/orders/${o.id}`);
                } catch (e) {
                  setMessage(customerError(e, locale));
                }
              }}
            >
              {o.referenceCode} · {statusLabel(o.lifecycleStatus, locale)}
            </button>
          ))}
          <nav aria-label={m.account.orderHistory}>
            <button
              disabled={busy || page === 1}
              onClick={() => changePage(page - 1)}
            >
              {m.account.previous}
            </button>
            <span> {page} </span>
            <button
              disabled={busy || !account.hasNext}
              onClick={() => changePage(page + 1)}
            >
              {m.account.next}
            </button>
          </nav>
          <PasswordForm
            locale={locale}
            messages={m.auth}
            onMessage={setMessage}
          />
          <h2>{m.address.title}</h2>
          {[...account.addresses, { id: "", label: "", address: {} }].map(
            (address) => (
              <AddressForm
                locale={locale}
                key={address.id}
                address={address}
                messages={m.address}
                onSaved={() => load()}
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
                setMessage(customerError(e, locale));
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
                    : customerError(e, locale),
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
  locale,
  address,
  messages,
  onSaved,
  onMessage,
}: {
  locale: string;
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
            onMessage(customerError(error, locale));
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
          onMessage(customerError(e, locale));
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
            const result = await request(
              "v1/recovery",
              { token },
              "PUT",
              parseRecoveryOrderDto,
            );
            window.location.assign(`/${locale}/orders/${result.orderId}`);
          } else {
            await request("v1/recovery", {
              ...Object.fromEntries(new FormData(e.currentTarget)),
              locale,
            });
            setMessage(m.checkEmailNotice);
          }
        } catch (e) {
          setMessage(customerError(e, locale));
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

"use client";
import {
  parsePaymentCheckoutDto,
  parseUploadIntentDto,
} from "@supastore/contracts";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { customerError } from "../../../packages/i18n/src/customer";
import { request } from "../lib/client";
import type { StorefrontMessages } from "../lib/i18n";
import { getStorefrontMessages } from "../lib/i18n";

export function OrderActions({
  id,
  locale,
  unpaid,
  stripeConfigured = false,
  proposal,
  proposedTotalLabel = "",
  messages,
  paymentStatus,
  returnableItems = [],
}: {
  id: string;
  locale: string;
  unpaid: boolean;
  stripeConfigured?: boolean;
  proposal?: { id: string; reason: string; proposedTotalCents: number } | null;
  proposedTotalLabel?: string;
  messages?: StorefrontMessages["order"];
  paymentStatus?: string | null;
  returnableItems?: { id: string; quantity: number; title: string }[];
}) {
  const m = messages ?? getStorefrontMessages(locale).order;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  useEffect(() => {
    if (!unpaid || !["creating", "open"].includes(paymentStatus || "")) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [unpaid, paymentStatus, router]);
  return (
    <div className="stack">
      <button disabled={busy} onClick={() => router.refresh()}>
        {m.refreshStatus}
      </button>
      {unpaid && ["creating", "open", "paid"].includes(paymentStatus || "") && (
        <p role="status">{m.processingPayment}</p>
      )}
      {paymentStatus === "review" && <p role="alert">{m.paymentReview}</p>}
      {paymentStatus === "expired" && <p role="status">{m.paymentExpired}</p>}
      {proposal && (
        <section className="notice">
          <h2>{m.orderChange}</h2>
          <p>{proposal.reason}</p>
          <p>
            {m.proposedTotal}: {proposedTotalLabel}
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request(`v1/orders/${encodeURIComponent(id)}/proposals`, {
                  proposalId: proposal.id,
                });
                window.location.reload();
              } catch (error) {
                setMessage(customerError(error, locale));
                setBusy(false);
              }
            }}
          >
            {m.acceptChange}
          </button>
        </section>
      )}
      {unpaid &&
        stripeConfigured &&
        !["review", "expired", "paid"].includes(paymentStatus || "") && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const checkout = await request(
                  "v1/payments/checkout",
                  { orderId: id, locale },
                  "POST",
                  parsePaymentCheckoutDto,
                );
                const url = new URL(checkout.url);
                if (
                  url.protocol !== "https:" ||
                  url.hostname !== "checkout.stripe.com"
                )
                  throw new Error("Invalid payment provider URL.");
                window.location.assign(url.href);
              } catch (error) {
                setMessage(customerError(error, locale));
                setBusy(false);
              }
            }}
          >
            {m.paySecurely}
          </button>
        )}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await request("v1/account/orders", { orderId: id }, "PUT");
            setMessage(m.addedToAccount);
          } catch (e) {
            setMessage(customerError(e, locale));
          } finally {
            setBusy(false);
          }
        }}
      >
        {m.addToAccount}
      </button>
      {unpaid && !paymentStatus && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const file = new FormData(e.currentTarget).get("file");
            if (!(file instanceof File)) return;
            setBusy(true);
            try {
              const intent = await request(
                "evidence",
                {
                  orderId: id,
                  mime: file.type,
                  size: file.size,
                },
                "POST",
                parseUploadIntentDto,
              );
              const upload = await fetch(
                `/api/evidence/upload?orderId=${encodeURIComponent(id)}&intentId=${encodeURIComponent(intent.intentId)}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": file.type },
                  body: file,
                },
              );
              if (!upload.ok) throw new Error("Upload failed. Please retry.");
              await request(
                "evidence",
                { orderId: id, intentId: intent.intentId },
                "PATCH",
              );
              setMessage(m.evidenceSubmitted);
            } catch (e) {
              setMessage(customerError(e, locale));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {m.paymentEvidence}
            <input
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required
            />
          </label>
          <button disabled={busy}>{m.submitEvidence}</button>
        </form>
      )}
      {!!returnableItems.length && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            requestKey.current ??= crypto.randomUUID();
            setBusy(true);
            try {
              await request(`v1/orders/${encodeURIComponent(id)}/returns`, {
                requestKey: requestKey.current,
                reason: form.get("reason"),
                items: returnableItems
                  .map((item) => ({
                    orderItemId: item.id,
                    quantity: Number(form.get(item.id)),
                  }))
                  .filter((item) => item.quantity > 0),
              });
              requestKey.current = null;
              setMessage(m.returnSubmitted);
              router.refresh();
            } catch (error) {
              setMessage(customerError(error, locale));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{m.requestReturn}</h2>
          <p>{m.returnNotice}</p>
          {returnableItems.map((item) => (
            <label key={item.id}>
              {item.title} · {m.returnQuantity}
              <input
                name={item.id}
                type="number"
                min={0}
                max={item.quantity}
                defaultValue={0}
                required
              />
            </label>
          ))}
          <label>
            {m.returnReason}
            <textarea name="reason" maxLength={500} required />
          </label>
          <button disabled={busy}>{m.requestReturn}</button>
        </form>
      )}
      <p role="status">{message}</p>
    </div>
  );
}

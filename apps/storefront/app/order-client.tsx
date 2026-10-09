"use client";
import { customerError } from "../../../packages/i18n/src/customer";
import { getStorefrontMessages } from "../lib/i18n";
import { useState } from "react";
import { request } from "../lib/client";
import type { StorefrontMessages } from "../lib/i18n";

export function OrderActions({
  id,
  locale,
  unpaid,
  stripeConfigured = false,
  proposal,
  proposedTotalLabel = "",
  messages,
}: {
  id: string;
  locale: string;
  unpaid: boolean;
  stripeConfigured?: boolean;
  proposal?: { id: string; reason: string; proposedTotalCents: number } | null;
  proposedTotalLabel?: string;
  messages?: StorefrontMessages["order"];
}) {
  const m = messages ?? getStorefrontMessages(locale).order;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
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
      {unpaid && stripeConfigured && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const checkout = await request<{ url: string }>(
                "v1/payments/checkout",
                { orderId: id, locale },
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
      {unpaid && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const file = new FormData(e.currentTarget).get("file");
            if (!(file instanceof File)) return;
            setBusy(true);
            try {
              const intent = await request<{ intentId: string }>("evidence", {
                orderId: id,
                mime: file.type,
                size: file.size,
              });
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
      <p role="status">{message}</p>
    </div>
  );
}

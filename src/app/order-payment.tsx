"use client";
import { customerError } from "@/i18n/customer";
import { parsePaymentCheckoutDto } from "@supastore/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { request } from "../../apps/storefront/lib/client";
import { getStorefrontMessages } from "../../apps/storefront/lib/i18n";

export function OrderPayment({
  id,
  locale,
  status,
  enabled,
}: {
  id: string;
  locale: string;
  status: string | null;
  enabled: boolean;
}) {
  const m = getStorefrontMessages(locale).order;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!["creating", "open"].includes(status || "")) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [status, router]);
  return (
    <section className="grid gap-3 mt-6">
      {status && (
        <p role="status">
          {status === "review"
            ? m.paymentReview
            : status === "expired"
              ? m.paymentExpired
              : m.processingPayment}
        </p>
      )}
      <button onClick={() => router.refresh()}>{m.refreshStatus}</button>
      {enabled && !["review", "expired", "paid"].includes(status || "") && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await request(
                "v1/payments/checkout",
                { orderId: id, locale },
                "POST",
                parsePaymentCheckoutDto,
              );
              const url = new URL(result.url);
              if (
                url.protocol !== "https:" ||
                url.hostname !== "checkout.stripe.com"
              )
                throw new Error("Invalid payment provider URL.");
              window.location.assign(url.href);
            } catch (error) {
              setError(customerError(error, locale));
              setBusy(false);
            }
          }}
        >
          {m.paySecurely}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

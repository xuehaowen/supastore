"use client";
import { customerError } from "@supastore/i18n/customer";
import { parsePaymentCheckoutDto } from "@supastore/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@supastore/ui/button";
import { textFor } from "@supastore/i18n/messages";
import { request } from "../lib/client";
import { getStorefrontMessages } from "../lib/i18n";

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
  const [refreshing, startRefresh] = useTransition();
  useEffect(() => {
    if (!["creating", "open", "paid"].includes(status || "")) return;
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
      <Button
        type="button"
        variant="outline"
        disabled={refreshing}
        aria-busy={refreshing}
        onClick={() => startRefresh(() => router.refresh())}
      >
        {refreshing ? textFor(locale).common.wait : m.refreshStatus}
      </Button>
      {enabled && !["review", "expired", "paid"].includes(status || "") && (
        <Button
          type="button"
          aria-busy={busy}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
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
          {busy ? textFor(locale).ui.openingPayment : m.paySecurely}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

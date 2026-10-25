import { textFor } from "@supastore/i18n/messages";
import type { CommercePreview } from "@supastore/contracts";
export function CommerceSummary({
  preview,
  locale,
}: {
  preview: CommercePreview;
  locale: string;
}) {
  const m = textFor(locale).commercePreview;
  const { evaluation: e } = preview;
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: preview.currency,
      minimumFractionDigits: preview.precision,
      maximumFractionDigits: preview.precision,
    }).format(value / 10 ** preview.precision);
  return (
    <div className="grid gap-2 text-sm" role="status" aria-live="polite">
      {preview.deliveryEstimateCents != null && (
        <p>
          {textFor(locale).ui.deliveryEstimate}:{" "}
          <strong>{money(preview.deliveryEstimateCents)}</strong>
        </p>
      )}
      {e.items.some((item) => item.pending) ? (
        <p>{m.completeDestination}</p>
      ) : (
        <>
          {e.merchandiseSubtotalCents !== null && (
            <p>
              {m.merchandiseEstimate}:{" "}
              <strong>{money(e.merchandiseSubtotalCents)}</strong>
            </p>
          )}
          {e.items.some((item) => !item.available) && (
            <p>{m.itemsUnavailable}</p>
          )}
        </>
      )}
      {!e.reward.pending && e.reward.rateBasisPoints !== null && (
        <p>
          {m.rewardRate}: {e.reward.rateBasisPoints / 100}%.{" "}
          {m.rewardRequirements}
        </p>
      )}
      {!e.shipping.pending && e.shipping.remainingCents !== null && (
        <p>
          {e.shipping.remainingCents > 0
            ? m.freeShippingRemaining.replace(
                "{amount}",
                money(e.shipping.remainingCents),
              )
            : m.freeShippingReached}
        </p>
      )}
      {e.promotion.pending ? (
        <p>{m.promotionPending}</p>
      ) : (
        !e.promotion.eligible && <p>{m.promotionIneligible}</p>
      )}
      <p className="text-xs text-muted-foreground">{m.estimateNotice}</p>
    </div>
  );
}

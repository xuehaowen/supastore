import type { CommercePreview } from "@supastore/contracts";
export function CommerceSummary({
  preview,
  locale,
}: {
  preview: CommercePreview;
  locale: string;
}) {
  const zh = locale === "zh";
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
      {e.items.some((item) => item.pending) ? (
        <p>
          {zh
            ? "请选择配送方式并补全目的地或自提地点以查看价格。"
            : "Choose fulfillment and complete the destination or pickup location to see prices."}
        </p>
      ) : (
        <>
          {e.merchandiseSubtotalCents !== null && (
            <p>
              {zh ? "商品小计（预估）" : "Merchandise estimate"}:{" "}
              <strong>{money(e.merchandiseSubtotalCents)}</strong>
            </p>
          )}
          {e.items.some((item) => !item.available) && (
            <p>
              {zh
                ? "部分商品无法按所选方式购买，或库存不足。请检查购物袋。"
                : "Some items are not offered for these options or have insufficient stock. Review your bag."}
            </p>
          )}
        </>
      )}
      {!e.reward.pending && e.reward.rateBasisPoints !== null && (
        <p>
          {zh ? "适用积分比例" : "Applicable reward rate"}:{" "}
          {e.reward.rateBasisPoints / 100}%.{" "}
          {zh
            ? "需使用已验证账户；积分仅基于符合条件的外部付款商品金额，并在履约后发放。"
            : "Requires a verified account; rewards depend on eligible externally funded merchandise and are released after fulfillment."}
        </p>
      )}
      {!e.shipping.pending && e.shipping.remainingCents !== null && (
        <p>
          {e.shipping.remainingCents > 0
            ? zh
              ? `再购 ${money(e.shipping.remainingCents)} 可享免运费。`
              : `Add ${money(e.shipping.remainingCents)} to qualify for free shipping.`
            : zh
              ? "已达到免运费门槛。"
              : "Free-shipping minimum reached."}
        </p>
      )}
      {e.promotion.pending ? (
        <p>
          {zh
            ? "请补全目的地或自提地点以检查此优惠码。"
            : "Complete your destination or pickup location to check this promotion."}
        </p>
      ) : (
        !e.promotion.eligible && (
          <p>
            {zh
              ? "优惠码不适用于当前配送方式或目的地。"
              : "This promotion is not eligible for the selected options."}
          </p>
        )
      )}
      <p className="text-xs text-muted-foreground">
        {zh
          ? "以上为预估，库存尚未预留。请在结账时确认最终价格、优惠和时间安排。"
          : "Estimates only; stock is not reserved. Confirm final prices, promotions and scheduling at checkout."}
      </p>
    </div>
  );
}

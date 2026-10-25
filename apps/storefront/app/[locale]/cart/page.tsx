import { readPage } from "../../../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import { getTranslations } from "next-intl/server";
import { Notice } from "../../components";
import { ShoppingPreview } from "../../shopping-preview-lazy";
import { CartContents } from "../../cart-contents";
import { countryOptions, stateOptions } from "@supastore/shipping/destination";
export const metadata = { robots: { index: false, follow: false } };
export default async function Cart({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ requestId?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { error, requestId } = await searchParams;
  const t = await getTranslations({ locale });
  const { cart, store } = await readPage("cart", locale);
  return (
    <section className="mx-auto my-12 min-h-[50vh] max-w-5xl">
      <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">
        {textFor(locale).common.selection}
      </p>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">
        {t("cart")}
      </h1>
      <Notice error={error} locale={locale} requestId={requestId} />
      {store?.hasContextualRules && (
        <p className="mb-4 text-sm text-muted-foreground">
          {textFor(locale).customerCopy.bagBasePriceNotice}
        </p>
      )}
      <CartContents
        cart={cart}
        locale={locale}
        currency={store?.currency ?? "USD"}
        precision={store?.precision ?? 2}
      />
      {!!cart?.items.length && (
        <ShoppingPreview
          locale={locale}
          destinations={{
            countries: countryOptions(locale),
            states: stateOptions(locale),
          }}
          items={cart.items.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          }))}
        />
      )}
    </section>
  );
}

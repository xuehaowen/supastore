import { parseOptionalCartDto, parseStoreDto } from "@supastore/contracts";
import Link from "next/link";
import { money, readApi } from "../../../lib/api";
import { getStorefrontMessages } from "../../../lib/i18n";
import { CartEditor } from "../../commerce";
export const metadata = { robots: { index: false, follow: false } };
export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const m = getStorefrontMessages(locale);
  const [cart, store] = await Promise.all([
    readApi(`cart?locale=${locale}`, parseOptionalCartDto),
    readApi("store", parseStoreDto),
  ]);
  return (
    <>
      <h1>{m.cart.title}</h1>
      {cart && cart.items.length ? (
        <>
          <CartEditor
            cart={cart}
            locale={locale}
            store={store}
            messages={m.cart}
          />
          <p>
            {money(cart.subtotalCents, store.currency, store.precision, locale)}
          </p>
          <Link href={`/${locale}/checkout`}>{m.cart.checkout}</Link>
        </>
      ) : (
        <p>{m.cart.empty}</p>
      )}
    </>
  );
}

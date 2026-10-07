import Link from "next/link";
import { readApi, money, type Cart, type Store } from "../../../lib/api";
import { CartEditor } from "../../commerce";
import { getStorefrontMessages } from "../../../lib/i18n";
export const metadata = { robots: { index: false, follow: false } };
export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const m = getStorefrontMessages(locale);
  const [cart, store] = await Promise.all([
    readApi<Cart | null>(`cart?locale=${locale}`),
    readApi<Store>("store"),
  ]);
  return (
    <>
      <h1>{m.cart.title}</h1>
      {cart && cart.items.length ? (
        <>
          <CartEditor cart={cart} locale={locale} store={store} messages={m.cart} />
          <p>{money(cart.subtotalCents, store.currency, store.precision)}</p>
          <Link href={`/${locale}/checkout`}>{m.cart.checkout}</Link>
        </>
      ) : (
        <p>{m.cart.empty}</p>
      )}
    </>
  );
}
import { readApi, type Cart, type Store } from "../../../lib/api";
import { Checkout } from "../../commerce";
import { getStorefrontMessages } from "../../../lib/i18n";
export const metadata = { robots: { index: false, follow: false } };
export default async function CheckoutPage({
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
      <h1>{m.checkout.title}</h1>
      {cart?.items.length ? (
        <Checkout
          cart={cart}
          store={store}
          locale={locale}
          messages={m.checkout}
        />
      ) : (
        <p>{m.checkout.addFirst}</p>
      )}
    </>
  );
}

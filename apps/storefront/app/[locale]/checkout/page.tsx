import { parseOptionalCartDto, parseStoreDto } from "@supastore/contracts";
import { readApi } from "../../../lib/api";
import { getStorefrontMessages } from "../../../lib/i18n";
import { Checkout } from "../../commerce";
export const metadata = { robots: { index: false, follow: false } };
export default async function CheckoutPage({
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

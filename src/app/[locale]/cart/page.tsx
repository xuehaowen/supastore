import Link from "next/link";
import { getCart } from "@/application/use-cases/cart/get-cart";
import { guestIdentity, money } from "@/infrastructure/web";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { getTranslations } from "next-intl/server";
import { changeItem } from "@/app/actions";
import { Hidden, Notice } from "@/app/components";
export default async function Cart({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations({locale});
  const identity = await guestIdentity();
  const cart = identity
    ? await getCart({ guestSessionId: identity, locale })
    : null;
  const [store] = await db.select().from(storeSettings).limit(1);
  return (
    <section className="narrow">
      <p className="eyebrow">YOUR SELECTION</p>
      <h1>{t("cart")}</h1>
      <Notice error={error} />
      {cart?.items.length ? (
        <>
          <div className="cart-lines">
            {cart.items.map((item) => (
              <article className="cart-line" key={item.id}>
                <div>
                  <Link href={"/" + locale + "/products/" + item.productHandle}>
                    <h2>{item.productTitle}</h2>
                  </Link>
                  <p>{item.title}</p>
                  {!item.isAvailable && (
                    <strong className="badge">{t("unavailable")}</strong>
                  )}
                </div>
                <form action={changeItem}>
                  <Hidden name="locale" value={locale} />
                  <Hidden name="itemId" value={item.id} />
                  <label>
                    {t("quantity")}
                    <input
                      aria-label={t("quantity") + " " + item.productTitle}
                      name="quantity"
                      type="number"
                      min="0"
                      max="999"
                      defaultValue={item.quantity}
                    />
                  </label>
                  <button className="secondary">Update</button>
                </form>
                <strong>
                  {money(
                    item.lineTotalCents,
                    store?.currency,
                    store?.precision,
                  )}
                </strong>
                <form action={changeItem}>
                  <Hidden name="locale" value={locale} />
                  <Hidden name="itemId" value={item.id} />
                  <Hidden name="quantity" value="0" />
                  <button className="text-button">{t("remove")}</button>
                </form>
              </article>
            ))}
          </div>
          <div className="total">
            <span>Subtotal</span>
            <strong>
              {money(cart.subtotalCents, store?.currency, store?.precision)}
            </strong>
          </div>
          <Link className="button" href={"/" + locale + "/checkout"}>
            {t("checkout")} →
          </Link>
        </>
      ) : (
        <>
          <p>{t("empty")}</p>
          <Link className="button" href={"/" + locale}>
            {t("shop")}
          </Link>
        </>
      )}
    </section>
  );
}

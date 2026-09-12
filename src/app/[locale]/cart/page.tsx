import Link from "next/link";
import { getCart } from "@/application/use-cases/cart/get-cart";
import { guestIdentity, money } from "@/infrastructure/web";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { getTranslations } from "next-intl/server";
import { changeItem } from "@/app/actions";
import { Hidden, Notice } from "@/app/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <section className="mx-auto my-12 min-h-[50vh] max-w-4xl">
      <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">YOUR SELECTION</p>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">{t("cart")}</h1>
      <Notice error={error} />
      {cart?.items.length ? (
        <>
          <div className="space-y-4">
            {cart.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="grid items-center gap-4 sm:grid-cols-[2fr_1fr_auto_auto]">
                <div>
                  <Link href={"/" + locale + "/products/" + item.productHandle}>
                    <h2>{item.productTitle}</h2>
                  </Link>
                  <p>{item.title}</p>
                  {!item.isAvailable && (
                    <Badge variant="secondary">{t("unavailable")}</Badge>
                  )}
                </div>
                <form action={changeItem}>
                  <Hidden name="locale" value={locale} />
                  <Hidden name="itemId" value={item.id} />
                  <div className="grid gap-2">
                  <Label>
                    {t("quantity")}
                    <Input
                      aria-label={t("quantity") + " " + item.productTitle}
                      name="quantity"
                      type="number"
                      min="0"
                      max="999"
                      defaultValue={item.quantity}
                    />
                  </Label>
                  </div>
                  <Button type="submit" variant="outline">Update</Button>
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
                  <Button type="submit" variant="link">{t("remove")}</Button>
                </form>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-6 flex justify-between border-t py-6 text-xl">
            <span>Subtotal</span>
            <strong>
              {money(cart.subtotalCents, store?.currency, store?.precision)}
            </strong>
          </div>
          <Button render={<Link href={"/" + locale + "/checkout"} />}>
            {t("checkout")} →
          </Button>
        </>
      ) : (
        <>
          <p>{t("empty")}</p>
          <Button render={<Link href={"/" + locale} />}>
            {t("shop")}
          </Button>
        </>
      )}
    </section>
  );
}

import Link from "next/link";
import { getCart } from "@/application/use-cases/cart/get-cart";
import { guestIdentity, money } from "@/infrastructure/web";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { getTranslations } from "next-intl/server";
import { changeItem } from "@/app/actions";
import { Hidden, Notice } from "@/app/components";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    <section className="mx-auto my-12 min-h-[50vh] max-w-5xl">
      <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">YOUR SELECTION</p>
      <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">{t("cart")}</h1>
      <Notice error={error} />
      {cart?.items.length ? (
        <>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <div className="space-y-4">
            {cart.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="grid items-center gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)_auto_auto]">
                <div>
                  <Link href={"/" + locale + "/products/" + item.productHandle}>
                    <h2>{item.productTitle}</h2>
                  </Link>
                  <p className="text-sm text-muted-foreground">{item.title}</p>
                  {!item.isAvailable && (
                    <Badge variant="secondary">{t("unavailable")}</Badge>
                  )}
                </div>
                <form className="cart-quantity-form" action={changeItem}>
                  <Hidden name="locale" value={locale} />
                  <Hidden name="itemId" value={item.id} />
                  <div className="cart-quantity-control">
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
                   <Button type="submit" variant="outline">Update</Button>
                  </div>
                 </form>
                 <strong className="tabular-nums">
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
          <aside aria-label="Order summary" className="rounded-xl border bg-card p-5 lg:sticky lg:top-6">
            <p className="text-sm font-medium text-muted-foreground">Order summary</p>
            <div className="mt-5 flex justify-between border-t pt-5 text-xl">
              <span>Subtotal</span>
              <strong className="tabular-nums">
                {money(cart.subtotalCents, store?.currency, store?.precision)}
              </strong>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Shipping, tax, and fulfillment options are confirmed at checkout.</p>
            <Link className={cn(buttonVariants({ size: "lg" }), "mt-5 w-full no-underline")} href={"/" + locale + "/checkout"}>
              {t("checkout")} <span aria-hidden="true">→</span>
            </Link>
          </aside>
          </div>
        </>
      ) : (
        <>
          <p>{t("empty")}</p>
          <Link className={cn(buttonVariants(), "mt-4 no-underline")} href={"/" + locale}>
            {t("shop")}
          </Link>
        </>
      )}
    </section>
  );
}

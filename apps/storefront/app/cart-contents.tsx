"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "./shopping-link";
import { Package, ShoppingBag } from "lucide-react";
import {
  MAX_ITEM_QUANTITY,
  type CustomerPageModels,
} from "@supastore/contracts";
import { textFor } from "@supastore/i18n/messages";
import { Button, buttonVariants } from "@supastore/ui/button";
import { Card, CardContent } from "@supastore/ui/card";
import { Badge } from "@supastore/ui/badge";
import { cn } from "@supastore/ui/utils";
import { money } from "../lib/web";
import { addItem, updateCartItem } from "./actions";
import { Notice } from "./components";

type CustomerCart = CustomerPageModels["cart"]["cart"];
type CartItem = NonNullable<CustomerCart>["items"][number];

export function CartContents({
  cart,
  locale,
  currency,
  precision,
}: {
  cart: CustomerCart;
  locale: string;
  currency: string;
  precision: number;
}) {
  const t = textFor(locale);
  const [removed, setRemoved] = useState<CartItem | null>(null);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const locked = useRef(false);
  function change(item: CartItem, quantity: number) {
    if (locked.current) return;
    locked.current = true;
    setError("");
    setRequestId("");
    startTransition(async () => {
      try {
        const data = new FormData();
        data.set("locale", locale);
        data.set("itemId", item.id);
        data.set("quantity", String(quantity));
        const result = await updateCartItem(data);
        if (result.error) {
          setError(result.error);
          setRequestId(result.requestId ?? "");
          return;
        }
        if (quantity === 0) {
          setRemoved(item);
          setStatus(t.ui.itemRemoved.replace("{name}", item.productTitle));
        } else setStatus(t.ui.bagUpdated);
      } catch {
        setError(t.auth.unableToComplete);
      } finally {
        locked.current = false;
      }
    });
  }
  function undo() {
    if (!removed || locked.current) return;
    locked.current = true;
    setError("");
    setRequestId("");
    const item = removed;
    startTransition(async () => {
      try {
        const data = new FormData();
        data.set("locale", locale);
        data.set("variantId", item.variantId);
        data.set("quantity", String(item.quantity));
        const result = await addItem({}, data);
        if (result.error) {
          setError(result.error);
          setRequestId(result.requestId ?? "");
          return;
        }
        setRemoved(null);
        setStatus(t.ui.bagUpdated);
      } catch {
        setError(t.auth.unableToComplete);
      } finally {
        locked.current = false;
      }
    });
  }
  return (
    <>
      <div role="status" aria-live="polite" className="mb-4 text-sm">
        {pending ? t.ui.updatingBag : status}
      </div>
      {removed && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <span>
            {t.ui.itemRemoved.replace("{name}", removed.productTitle)}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={undo}
            disabled={pending}
          >
            {t.ui.undoRemove}
          </Button>
        </div>
      )}
      <Notice error={error} locale={locale} requestId={requestId} />
      {cart?.items.length ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <div className="space-y-4" aria-busy={pending}>
            {cart.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="grid items-center gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)_auto_auto]">
                  <div className="cart-item-info">
                    {item.imageKey ? (
                      <Image
                        className="cart-item-image"
                        src={`/api/assets?key=${encodeURIComponent(item.imageKey)}&inline=1`}
                        alt={item.productTitle}
                        width={144}
                        height={160}
                        sizes="72px"
                      />
                    ) : (
                      <span
                        className="cart-item-image flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <Package size={24} strokeWidth={1} />
                      </span>
                    )}
                    <div>
                      <Link href={`/${locale}/products/${item.productHandle}`}>
                        <h2>{item.productTitle}</h2>
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {item.title}
                      </p>
                      {!item.isAvailable && (
                        <Badge variant="secondary">{t.unavailable}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex w-fit items-center gap-1 rounded-lg border bg-background p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-11 p-0"
                      disabled={pending || item.quantity <= 1}
                      aria-label={t.common.decreaseQuantityFor.replace(
                        "{name}",
                        item.productTitle,
                      )}
                      onClick={() => change(item, item.quantity - 1)}
                    >
                      −
                    </Button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums">
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-11 p-0"
                      disabled={pending || item.quantity >= MAX_ITEM_QUANTITY}
                      aria-label={t.common.increaseQuantityFor.replace(
                        "{name}",
                        item.productTitle,
                      )}
                      onClick={() => change(item, item.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>
                  <strong className="tabular-nums">
                    {money(item.lineTotalCents, currency, precision, locale)}
                  </strong>
                  <Button
                    type="button"
                    variant="link"
                    disabled={pending}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`${t.remove} · ${item.productTitle}`}
                    onClick={() => change(item, 0)}
                  >
                    {t.remove}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <aside
            aria-label={t.common.summary}
            className="rounded-xl border bg-card p-5 lg:sticky lg:top-6"
          >
            <p className="text-sm font-medium text-muted-foreground">
              {t.ui.orderSummary}
            </p>
            <div className="mt-5 flex justify-between border-t pt-5 text-xl">
              <span>{t.checkoutDetails.subtotal}</span>
              <strong className="tabular-nums">
                {money(cart.subtotalCents, currency, precision, locale)}
              </strong>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {t.ui.shippingTaxAndFulfillmentOptionsAreConfirmedAtCheckout}
            </p>
            {pending ? (
              <Button className="mt-5 w-full" size="lg" disabled>
                {t.ui.updatingBag}
              </Button>
            ) : (
              <Link
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "mt-5 w-full no-underline",
                )}
                href={`/${locale}/checkout`}
              >
                {t.checkout} <span aria-hidden="true">→</span>
              </Link>
            )}
          </aside>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="mb-4 flex size-20 items-center justify-center rounded-full bg-muted"
            aria-hidden="true"
          >
            <ShoppingBag size={32} />
          </div>
          <h2 className="mb-2 font-serif text-2xl font-medium">{t.empty}</h2>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            {
              t.ui
                .yourShoppingBagIsEmptyExploreOurCollectionOfCarefullyCuratedEverydayGoods
            }
          </p>
          <Link
            className={cn(buttonVariants({ size: "lg" }), "no-underline")}
            href={`/${locale}`}
          >
            {t.shop} <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </>
  );
}

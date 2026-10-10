"use client";
import { useState } from "react";
import { customerError } from "../../../packages/i18n/src/customer";
import { request } from "../lib/client";
import type { StorefrontMessages } from "../lib/i18n";
import { getStorefrontMessages } from "../lib/i18n";
import { money, type Cart, type Product, type Store } from "../lib/types";

export function AddToCart({
  product,
  locale,
  store,
  messages,
}: {
  product: Product;
  locale: string;
  store: Store;
  messages?: StorefrontMessages["product"];
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const m = messages ?? getStorefrontMessages(locale).product;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await request("v1/cart", {
            locale,
            variantId: f.get("variantId"),
            quantity: Number(f.get("quantity")),
          });
          window.location.assign(`/${locale}/cart`);
        } catch (e) {
          setMsg(customerError(e, locale));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {m.variant}
        <select name="variantId">
          {product.variants
            .filter((v) => v.isAvailable)
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} —{" "}
                {money(v.priceCents, store.currency, store.precision, locale)}
              </option>
            ))}
        </select>
      </label>
      <label>
        {m.quantity}
        <input
          name="quantity"
          type="number"
          min="1"
          max="999"
          defaultValue="1"
          required
        />
      </label>
      <button
        disabled={
          busy ||
          !product.variants.some((v) => v.isAvailable) ||
          store.isPaused ||
          !store.isOrderingEnabled
        }
      >
        {m.addToCart}
      </button>
      <p role="status">{msg}</p>
    </form>
  );
}
export function CartEditor({
  cart,
  locale,
  store,
  messages,
}: {
  cart: Cart;
  locale: string;
  store: Store;
  messages?: StorefrontMessages["cart"];
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const m = messages ?? getStorefrontMessages(locale).cart;
  return (
    <div className="stack">
      {cart.items.map((item) => (
        <form
          className="card"
          key={item.id}
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await request(
                "v1/cart",
                {
                  locale,
                  itemId: item.id,
                  quantity: Number(data.get("quantity")),
                },
                "PATCH",
              );
              window.location.reload();
            } catch (e) {
              setMsg(customerError(e, locale));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>
            {item.productTitle} · {item.title}
          </h2>
          <p>
            {money(
              item.lineTotalCents,
              store.currency,
              store.precision,
              locale,
            )}
          </p>
          {!item.isAvailable && <p>{m.unavailable}</p>}
          <label>
            {m.quantityLabel}
            <input
              name="quantity"
              type="number"
              min="0"
              max="999"
              defaultValue={item.quantity}
              required
            />
          </label>
          <button disabled={busy}>{m.update}</button>
        </form>
      ))}
      <p role="status">{msg}</p>
    </div>
  );
}
export { Checkout } from "./checkout/checkout";

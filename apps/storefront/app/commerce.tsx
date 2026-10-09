"use client";
import { useState } from "react";
import { request } from "../lib/client";
import { creditMinorUnits } from "../lib/amount";
import { money, type Cart, type Product, type Store } from "../lib/types";
import type { StorefrontMessages } from "../lib/i18n";
import {
  countryOptions,
  usStates,
  shippingRequiredFields,
  availableFulfillment,
} from "../../../packages/shipping/src/destination";

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
  const m = messages;
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
          setMsg(
            e instanceof Error ? e.message : (m?.pleaseRetry ?? "Please retry"),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {m?.variant ?? "Variant"}
        <select name="variantId">
          {product.variants
            .filter((v) => v.isAvailable)
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} —{" "}
                {money(v.priceCents, store.currency, store.precision)}
              </option>
            ))}
        </select>
      </label>
      <label>
        {m?.quantity ?? "Quantity"}
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
        {m?.addToCart ?? "Add to cart"}
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
  const m = messages;
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
              setMsg(
                e instanceof Error
                  ? e.message
                  : (m?.pleaseRetry ?? "Please retry"),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>
            {item.productTitle} · {item.title}
          </h2>
          <p>{money(item.lineTotalCents, store.currency, store.precision)}</p>
          {!item.isAvailable && (
            <p>{m?.unavailable ?? "This item is unavailable"}</p>
          )}
          <label>
            {m?.quantityLabel ?? "Quantity (0 removes item)"}
            <input
              name="quantity"
              type="number"
              min="0"
              max="999"
              defaultValue={item.quantity}
              required
            />
          </label>
          <button disabled={busy}>{m?.update ?? "Update"}</button>
        </form>
      ))}
      <p role="status">{msg}</p>
    </div>
  );
}
interface Quote {
  id: string;
  totalPayableCents: number;
  shippingCents: number;
  exclusiveTaxCents: number;
  inclusiveTaxCents: number;
  discountCents: number;
  expiresAt: string;
}
export function Checkout({
  cart,
  locale,
  store,
  messages,
}: {
  cart: Cart;
  locale: string;
  store: Store;
  messages?: StorefrontMessages["checkout"];
}) {
  const m = messages;
  const [quote, setQuote] = useState<Quote | null>(null);
  const methods = availableFulfillment(store.commercePolicy, {
    shipping: store.shippingZones.length,
    pickup: store.pickupLocations.length,
    delivery: store.deliveryAreas?.length ?? 0,
  });
  const [country, setCountry] = useState("US");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const requiredShipping = shippingRequiredFields(
    store.shippingZones.map((zone) => ({
      countryCodes: zone.countryCodes ?? null,
      regionCodes: zone.regionCodes ?? [],
      postalPrefixes: zone.postalPrefixes ?? [],
    })),
    country,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [chosenMethod, setMethod] = useState("");
  const method =
    methods.find((item) => item === chosenMethod) ?? methods[0] ?? "";
  const [locationId, setLocationId] = useState(
    store.pickupLocations[0]?.id || "",
  );
  const location = store.pickupLocations.find((p) => p.id === locationId);
  const [pickupDate, setPickupDate] = useState(location?.dates[0]?.date || "");
  const slots = location?.dates.find((d) => d.date === pickupDate)?.slots || [];
  const [deliveryAreaId, setDeliveryAreaId] = useState(
    store.deliveryAreas?.[0]?.id || "",
  );
  const deliveryArea = store.deliveryAreas?.find(
    (area) => area.id === deliveryAreaId,
  );
  const [deliveryDate, setDeliveryDate] = useState(
    deliveryArea?.dates[0]?.date || "",
  );
  const deliverySlots =
    deliveryArea?.dates.find((date) => date.date === deliveryDate)?.slots || [];
  return (
    <form
      className="stack"
      onChange={() => {
        if (quote) setQuote(null);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setMsg("");
        try {
          if (!quote) {
            const q = await request<Quote>("v1/quotes", {
              cartId: cart.id,
              fulfillmentType: method,
              country: f.get("country") || "",
              address: f.get("address") || "",
              postalCode: f.get("postalCode") || "",
              region: f.get("region") || "",
              ...(f.get("deliveryAreaId")
                ? { deliveryAreaId: f.get("deliveryAreaId") }
                : {}),
              pickupDate: f.get("pickupDate") || "",
              pickupTime: f.get("pickupTime") || "",
              ...(f.get("pickupLocationId")
                ? { pickupLocationId: f.get("pickupLocationId") }
                : {}),
              ...(f.get("paymentAccountId")
                ? { paymentAccountId: f.get("paymentAccountId") }
                : {}),
              promotionCode: f.get("promotionCode") || "",
            });
            setQuote(q);
          } else {
            if (!f.has("accepted"))
              throw new Error(m?.acceptTotalError ?? "Accept the final total");
            const order = await request<{ id: string }>("v1/orders", {
              quoteId: quote.id,
              name: f.get("name"),
              email: f.get("email"),
              accepted: true,
              creditAppliedCents: creditMinorUnits(
                String(f.get("creditAmount") || "0"),
                store.precision,
              ),
            });
            window.location.assign(`/${locale}/orders/${order.id}`);
          }
        } catch (e) {
          setMsg(
            e instanceof Error ? e.message : (m?.pleaseRetry ?? "Please retry"),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="checkout-name">{m?.name ?? "Name"}</label>
      <input id="checkout-name" name="name" required autoComplete="name" />
      <label htmlFor="checkout-email">{m?.email ?? "Email"}</label>
      <input
        id="checkout-email"
        name="email"
        type="email"
        required
        autoComplete="email"
      />
      <label htmlFor="checkout-fulfillment">
        {m?.fulfillment ?? "Fulfillment"}
      </label>
      <select
        id="checkout-fulfillment"
        value={method}
        onChange={(e) => setMethod(e.target.value)}
      >
        {methods.includes("shipping") && (
          <option value="shipping">{m?.shipping ?? "Shipping"}</option>
        )}
        {methods.includes("pickup") && (
          <option value="pickup">{m?.pickup ?? "Pickup"}</option>
        )}
        {methods.includes("local_delivery") && (
          <option value="local_delivery">
            {m?.localDelivery ?? "Local delivery"}
          </option>
        )}
      </select>
      {method === "shipping" || method === "local_delivery" ? (
        <>
          <label htmlFor="checkout-country">{m?.country ?? "Country"}</label>
          <select
            id="checkout-country"
            name="country"
            autoComplete="country"
            value={country}
            onChange={(event) => {
              setCountry(event.target.value);
              setRegion("");
              setPostalCode("");
            }}
            required
          >
            {countryOptions(locale).map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
          {method === "shipping" && (
            <>
              <label htmlFor="checkout-region">
                {m?.region ?? "State / region"}
              </label>
              {country === "US" ? (
                <select
                  id="checkout-region"
                  name="region"
                  autoComplete="address-level1"
                  value={region}
                  required={requiredShipping.region}
                  onChange={(event) => setRegion(event.target.value)}
                >
                  <option value="">
                    {m?.chooseRegion ?? "Choose a state"}
                  </option>
                  {usStates.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="checkout-region"
                  name="region"
                  autoComplete="address-level1"
                  maxLength={12}
                  value={region}
                  required={requiredShipping.region}
                  onChange={(event) =>
                    setRegion(event.target.value.toUpperCase())
                  }
                />
              )}
              <label htmlFor="checkout-shipping-postal">
                {m?.postalCode ?? "ZIP / postal code"}
              </label>
              <input
                id="checkout-shipping-postal"
                name="postalCode"
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                autoComplete="postal-code"
                maxLength={40}
                required={requiredShipping.postalCode}
              />
            </>
          )}
          {method === "local_delivery" && (
            <>
              <label htmlFor="checkout-delivery-area">
                {m?.deliveryArea ?? "Delivery area"}
              </label>
              <select
                id="checkout-delivery-area"
                name="deliveryAreaId"
                required
                value={deliveryAreaId}
                onChange={(e) => {
                  setDeliveryAreaId(e.target.value);
                  setDeliveryDate(
                    store.deliveryAreas?.find(
                      (area) => area.id === e.target.value,
                    )?.dates[0]?.date || "",
                  );
                }}
              >
                {store.deliveryAreas?.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name} ({area.countryCodes.join(", ")}
                    {area.postalPrefixes.length
                      ? ` · ${area.postalPrefixes.join(", ")}`
                      : ""}
                    )
                  </option>
                ))}
              </select>
              <label htmlFor="checkout-postal-code">
                {m?.postalCode ?? "Postal code"}
              </label>
              <input
                id="checkout-postal-code"
                name="postalCode"
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
                required
                maxLength={20}
                autoComplete="postal-code"
              />
              {deliveryArea?.scheduleRequired && (
                <>
                  <label htmlFor="checkout-delivery-date">
                    {m?.deliveryDate ?? "Delivery date"}
                  </label>
                  <select
                    id="checkout-delivery-date"
                    name="pickupDate"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  >
                    <option value="">{m?.chooseDate ?? "Choose date"}</option>
                    {deliveryArea.dates.map((date) => (
                      <option key={date.date} value={date.date}>
                        {date.date}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="checkout-delivery-time">
                    {m?.deliveryWindow ?? "Delivery window"}
                  </label>
                  <select
                    id="checkout-delivery-time"
                    name="pickupTime"
                    required
                    key={`${deliveryAreaId}-${deliveryDate}`}
                  >
                    <option value="">{m?.chooseTime ?? "Choose time"}</option>
                    {deliverySlots.map((slot) => (
                      <option key={slot.startTime} value={slot.startTime}>
                        {slot.startTime}–{slot.endTime}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}
          <label htmlFor="checkout-address">
            {m?.fullShippingAddress ?? "Full shipping address"}
          </label>
          <textarea
            id="checkout-address"
            name="address"
            maxLength={2000}
            required
            autoComplete="street-address"
          />
        </>
      ) : method === "pickup" ? (
        <>
          <label htmlFor="checkout-pickup-location">
            {m?.pickupLocation ?? "Pickup location"}
          </label>
          <select
            id="checkout-pickup-location"
            name="pickupLocationId"
            required
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPickupDate(
                store.pickupLocations.find((p) => p.id === e.target.value)
                  ?.dates[0]?.date || "",
              );
            }}
          >
            {store.pickupLocations.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.address}
              </option>
            ))}
          </select>
          {location?.scheduleRequired !== false && (
            <>
              <label htmlFor="checkout-pickup-date">
                {m?.pickupDate ?? "Pickup date"}
              </label>
              <select
                id="checkout-pickup-date"
                name="pickupDate"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                required
              >
                <option value="">{m?.chooseDate ?? "Choose date"}</option>
                {location?.dates.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.date}
                  </option>
                ))}
              </select>
              <label htmlFor="checkout-pickup-time">
                {m?.pickupTime ?? "Pickup time"}
              </label>
              <select
                id="checkout-pickup-time"
                name="pickupTime"
                required
                key={`${locationId}-${pickupDate}`}
              >
                <option value="">{m?.chooseTime ?? "Choose time"}</option>
                {slots.map((s) => (
                  <option key={s.startTime} value={s.startTime}>
                    {s.startTime}–{s.endTime}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      ) : (
        <p role="status">
          {m?.noFulfillment ??
            "No fulfillment methods are available. Please contact the store."}
        </p>
      )}
      <label htmlFor="checkout-payment-method">
        {m?.paymentMethod ?? "Payment method"}
      </label>
      <select
        id="checkout-payment-method"
        name="paymentAccountId"
        required={!store.stripeConfigured}
      >
        {store.stripeConfigured && (
          <option value="">
            {m?.onlineCardPayment ?? "Online card payment"}
          </option>
        )}
        {store.paymentMethods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label htmlFor="checkout-promo-code">
        {m?.promoCode ?? "Promotion code"}
      </label>
      <input id="checkout-promo-code" name="promotionCode" maxLength={100} />
      <label htmlFor="checkout-credit-amount">
        {m?.creditToApply ?? "Account credit to apply"} ({store.currency})
      </label>
      <input
        id="checkout-credit-amount"
        name="creditAmount"
        type="number"
        defaultValue="0"
        min="0"
        step={10 ** -store.precision}
      />
      {quote && (
        <div className="notice">
          <p>
            {m?.shippingCost ?? "Shipping"}:{" "}
            {money(quote.shippingCents, store.currency, store.precision)}
          </p>
          <p>
            {m?.tax ?? "Tax"}:{" "}
            {money(
              quote.exclusiveTaxCents + quote.inclusiveTaxCents,
              store.currency,
              store.precision,
            )}
          </p>
          <p>
            {m?.discount ?? "Discount"}:{" "}
            {money(quote.discountCents, store.currency, store.precision)}
          </p>
          <strong>
            {m?.orderTotal ?? "Order total"}:{" "}
            {money(quote.totalPayableCents, store.currency, store.precision)}
          </strong>
          <p>
            {m?.quoteExpires ?? "Quote expires"}:{" "}
            {new Date(quote.expiresAt).toLocaleString(locale)}
          </p>
          <label htmlFor="checkout-accepted" className="check">
            <input
              id="checkout-accepted"
              name="accepted"
              type="checkbox"
              required
              onChange={(e) => e.stopPropagation()}
            />
            {m?.acceptTotal ?? "I accept this final total"}
          </label>
        </div>
      )}
      <button
        disabled={
          busy || !methods.length || store.isPaused || !store.isOrderingEnabled
        }
      >
        {quote
          ? (m?.placeOrder ?? "Place order")
          : (m?.reviewTotal ?? "Review final total")}
      </button>
      <p role="status">{msg}</p>
    </form>
  );
}

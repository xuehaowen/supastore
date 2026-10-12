"use client";
import { formatLocalDate } from "../../../../packages/i18n/src/customer";
import {
  countryOptions,
  stateOptions,
} from "../../../../packages/shipping/src/destination";
import { type StorefrontMessages } from "../../lib/i18n";
import { type Store } from "../../lib/types";
import { useCheckout } from "./use-checkout";
export function FulfillmentFields({
  checkout,
  store,
  locale,
  m,
}: {
  checkout: ReturnType<typeof useCheckout>;
  store: Store;
  locale: string;
  m: StorefrontMessages["checkout"];
}) {
  const {
    account,
    address,
    setAddress,
    setCustomerName,
    methods,
    country,
    setCountry,
    region,
    setRegion,
    postalCode,
    setPostalCode,
    requiredShipping,
    method,
    setMethod,
    locationId,
    setLocationId,
    location,
    pickupDate,
    setPickupDate,
    slots,
    deliveryAreaId,
    setDeliveryAreaId,
    deliveryArea,
    deliveryDate,
    setDeliveryDate,
    deliverySlots,
  } = checkout;
  return (
    <>
      {" "}
      <label htmlFor="checkout-fulfillment">{m.fulfillment}</label>
      <select
        id="checkout-fulfillment"
        value={method}
        onChange={(e) => setMethod(e.target.value)}
      >
        {methods.includes("shipping") && (
          <option value="shipping">{m.shipping}</option>
        )}
        {methods.includes("pickup") && (
          <option value="pickup">{m.pickup}</option>
        )}
        {methods.includes("local_delivery") && (
          <option value="local_delivery">{m.localDelivery}</option>
        )}
      </select>
      {method === "shipping" || method === "local_delivery" ? (
        <>
          <label htmlFor="checkout-country">{m.country}</label>
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
              <label htmlFor="checkout-region">{m.region}</label>
              {country === "US" ? (
                <select
                  id="checkout-region"
                  name="region"
                  autoComplete="address-level1"
                  value={region}
                  required={requiredShipping.region}
                  onChange={(event) => setRegion(event.target.value)}
                >
                  <option value="">{m.chooseRegion}</option>
                  {stateOptions(locale).map(([code, name]) => (
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
              <label htmlFor="checkout-shipping-postal">{m.postalCode}</label>
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
              <label htmlFor="checkout-delivery-area">{m.deliveryArea}</label>
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
              <label htmlFor="checkout-postal-code">{m.postalCode}</label>
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
                    {m.deliveryDate}
                  </label>
                  <select
                    id="checkout-delivery-date"
                    name="pickupDate"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  >
                    <option value="">{m.chooseDate}</option>
                    {deliveryArea.dates.map((date) => (
                      <option key={date.date} value={date.date}>
                        {formatLocalDate(date.date, locale)}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="checkout-delivery-time">
                    {m.deliveryWindow}
                  </label>
                  <select
                    id="checkout-delivery-time"
                    name="pickupTime"
                    required
                    key={`${deliveryAreaId}-${deliveryDate}`}
                  >
                    <option value="">{m.chooseTime}</option>
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
          {!!account?.addresses.length && (
            <label htmlFor="checkout-saved-address">
              {m.savedAddress}
              <select
                id="checkout-saved-address"
                aria-label={m.savedAddress}
                defaultValue=""
                onChange={(e) => {
                  const saved = account.addresses.find(
                    (a) => a.id === e.target.value,
                  );
                  if (!saved) return;
                  setAddress(
                    [
                      saved.address.line1,
                      saved.address.line2,
                      saved.address.city,
                    ]
                      .filter(Boolean)
                      .join(", "),
                  );
                  setCountry(saved.address.country || "");
                  setRegion(saved.address.region || "");
                  setPostalCode(saved.address.postalCode || "");
                  setCustomerName(saved.address.name || account.customer.name);
                }}
              >
                <option value="">{m.enterAddress}</option>
                {account.addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label htmlFor="checkout-address">{m.fullShippingAddress}</label>
          <textarea
            id="checkout-address"
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={2000}
            required
            autoComplete="street-address"
          />
        </>
      ) : method === "pickup" ? (
        <>
          <label htmlFor="checkout-pickup-location">{m.pickupLocation}</label>
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
              <label htmlFor="checkout-pickup-date">{m.pickupDate}</label>
              <select
                id="checkout-pickup-date"
                name="pickupDate"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                required
              >
                <option value="">{m.chooseDate}</option>
                {location?.dates.map((d) => (
                  <option key={d.date} value={d.date}>
                    {formatLocalDate(d.date, locale)}
                  </option>
                ))}
              </select>
              <label htmlFor="checkout-pickup-time">{m.pickupTime}</label>
              <select
                id="checkout-pickup-time"
                name="pickupTime"
                required
                key={`${locationId}-${pickupDate}`}
              >
                <option value="">{m.chooseTime}</option>
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
        <p role="status">{m.noFulfillment}</p>
      )}
    </>
  );
}

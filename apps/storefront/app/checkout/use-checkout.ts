"use client";
import { parseCustomerAccountDto } from "@supastore/contracts";

import {
  parseCreatedOrderDto,
  parseQuoteDto,
  type CreateOrderRequestDto,
  type CustomerAccountDto,
  type QuoteRequestDto,
} from "@supastore/contracts";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { customerError } from "../../../../packages/i18n/src/customer";
import {
  availableFulfillment,
  shippingRequiredFields,
} from "../../../../packages/shipping/src/destination";
import { creditMinorUnits } from "../../lib/amount";
import { ApiError, request } from "../../lib/client";
import type { StorefrontMessages } from "../../lib/i18n";
import type { Cart, Store } from "../../lib/types";
import { checkoutReducer } from "./checkout-state";
export function useCheckout(
  cart: Cart,
  locale: string,
  store: Store,
  m: StorefrontMessages["checkout"],
) {
  const [review, dispatch] = useReducer(checkoutReducer, {
    phase: "editing",
    quote: null,
    message: "",
  });
  const { quote, message: msg } = review;
  const busy = review.phase === "reviewing" || review.phase === "placing";
  const revision = useRef(0);
  const inFlight = useRef(false);
  const invalidateQuote = () => {
    revision.current++;
    dispatch({ type: "quote", quote: null });
  };
  const setMsg = useCallback(
    (message: string) => dispatch({ type: "message", message }),
    [],
  );
  const setBusy = (busy: boolean) =>
    dispatch({ type: busy ? "start" : "finish" });
  const [account, setAccount] = useState<CustomerAccountDto | null>(null);
  const [creditAmount, setCreditAmount] = useState("0");
  const [address, setAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  useEffect(() => {
    let active = true;
    request("v1/account", undefined, "GET", parseCustomerAccountDto)
      .then((value) => {
        if (!active) return;
        setAccount(value);
        setCustomerName(value.customer.name);
        setCustomerEmail(value.customer.email);
      })
      .catch((error) => {
        if (active && !(error instanceof ApiError && error.status === 401))
          setMsg(customerError(error, locale));
      });
    return () => {
      active = false;
    };
  }, [locale, setMsg]);
  const availableCredit =
    account?.credit && account.credit.reconciled !== false
      ? Math.max(0, account.credit.balanceCents - account.credit.reservedCents)
      : 0;
  let appliedCredit = 0;
  try {
    appliedCredit = creditMinorUnits(creditAmount, store.precision);
  } catch {
    /* Submission presents validation feedback. */
  }
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
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const submittedRevision = revision.current;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg("");
    try {
      if (!quote) {
        const payload = {
          cartId: cart.id,
          fulfillmentType: method as QuoteRequestDto["fulfillmentType"],
          country: String(f.get("country") || ""),
          address: String(f.get("address") || ""),
          postalCode: String(f.get("postalCode") || ""),
          region: String(f.get("region") || ""),
          ...(f.get("deliveryAreaId")
            ? { deliveryAreaId: String(f.get("deliveryAreaId")) }
            : {}),
          pickupDate: String(f.get("pickupDate") || ""),
          pickupTime: String(f.get("pickupTime") || ""),
          ...(f.get("pickupLocationId")
            ? { pickupLocationId: String(f.get("pickupLocationId")) }
            : {}),
          ...(f.get("paymentAccountId")
            ? { paymentAccountId: String(f.get("paymentAccountId")) }
            : {}),
          promotionCode: String(f.get("promotionCode") || ""),
        } satisfies QuoteRequestDto;
        const q = parseQuoteDto(await request("v1/quotes", payload));
        const credit = creditMinorUnits(
          String(f.get("creditAmount") || "0"),
          store.precision,
        );
        if (credit > availableCredit || credit > q.totalPayableCents)
          throw new Error(m.creditInvalid);
        if (
          credit < q.totalPayableCents &&
          !f.get("paymentAccountId") &&
          !store.stripeConfigured
        )
          throw new Error(m.paymentRequired);
        if (revision.current === submittedRevision)
          dispatch({ type: "quote", quote: q });
      } else {
        if (!f.has("accepted")) throw new Error(m.acceptTotalError);
        const credit = creditMinorUnits(
          String(f.get("creditAmount") || "0"),
          store.precision,
        );
        if (credit > availableCredit || credit > quote.totalPayableCents)
          throw new Error(m.creditInvalid);
        if (
          credit < quote.totalPayableCents &&
          !f.get("paymentAccountId") &&
          !store.stripeConfigured
        )
          throw new Error(m.paymentRequired);
        const payload = {
          locale: locale === "zh" ? "zh" : "en",
          quoteId: quote.id,
          name: String(f.get("name") || ""),
          email: String(f.get("email") || ""),
          accepted: true,
          creditAppliedCents: credit,
        } satisfies CreateOrderRequestDto;
        const order = parseCreatedOrderDto(await request("v1/orders", payload));
        window.location.assign(`/${locale}/orders/${order.id}`);
      }
    } catch (e) {
      setMsg(
        e instanceof Error &&
          [m.creditInvalid, m.paymentRequired, m.acceptTotalError].includes(
            e.message,
          )
          ? e.message
          : customerError(e, locale),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return {
    quote,
    invalidateQuote,
    account,
    creditAmount,
    setCreditAmount,
    address,
    setAddress,
    customerName,
    setCustomerName,
    customerEmail,
    setCustomerEmail,
    availableCredit,
    appliedCredit,
    methods,
    country,
    setCountry,
    region,
    setRegion,
    postalCode,
    setPostalCode,
    requiredShipping,
    busy,
    msg,
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
    submit,
  };
}

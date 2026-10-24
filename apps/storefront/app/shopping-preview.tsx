"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  parseCommercePreview,
  MAX_CART_LINES,
  type CommercePreview,
  type CommercePreviewRequest,
} from "@supastore/contracts";
import { fetchJson } from "../lib/fetch-json";
import { responseData, responseMessage } from "../lib/response";
import { CommerceSummary } from "./commerce-summary";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { NativeSelect } from "@supastore/ui/native-select";
import { textFor } from "@supastore/i18n/messages";
export type DestinationOptions = {
  countries: { code: string; name: string }[];
  states: (readonly [string, string])[];
};

export function ShoppingPreview({
  items,
  locale,
  onEvaluation,
  destinations = { countries: [], states: [] },
}: {
  items: { variantId: string; quantity: number }[];
  locale: string;
  onEvaluation?: ((preview: CommercePreview | null) => void) | undefined;
  destinations?: DestinationOptions | undefined;
}) {
  const m = textFor(locale).commercePreview;
  const [preview, setPreview] = useState<CommercePreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState("");
  const [country, setCountry] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [optionsRevision, setOptionsRevision] = useState(0);
  const [options, setOptions] = useState<Pick<
    CommercePreview,
    "methods" | "locations"
  > | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const callback = useRef(onEvaluation);
  callback.current = onEvaluation;
  const itemKey = JSON.stringify(items);
  const cancel = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
  }, []);
  useEffect(() => {
    cancel();
    setPreview(null);
    callback.current?.(null);
    setBusy(false);
    return cancel;
  }, [itemKey, cancel]);
  useEffect(() => {
    const active = new AbortController();
    setLoadingOptions(true);
    setOptionsFailed(false);
    setOptions(null);
    void (async () => {
      try {
        const { response, data } = await fetchJson("/api/v1/evaluation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: JSON.parse(itemKey), context: {} }),
          cache: "no-store",
          signal: active.signal,
        });
        if (!response.ok) throw new Error("Options unavailable");
        const result = parseCommercePreview(responseData(data, true));
        if (active.signal.aborted) return;
        setOptions(result);
        setMethod((current) =>
          result.methods.some((value) => value === current)
            ? current
            : (result.methods[0] ?? ""),
        );
      } catch {
        if (!active.signal.aborted) setOptionsFailed(true);
      } finally {
        if (!active.signal.aborted) setLoadingOptions(false);
      }
    })();
    return () => active.abort();
  }, [itemKey, locale, optionsRevision]);
  function invalidate() {
    sequence.current++;
    controller.current?.abort();
    setPreview(null);
    callback.current?.(null);
    setMessage("");
    setBusy(false);
  }
  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const form = new FormData(event.currentTarget);
    const requestContext: CommercePreviewRequest["context"] = {};
    if (
      method === "pickup" ||
      method === "shipping" ||
      method === "local_delivery"
    )
      requestContext.fulfillmentType = method;
    for (const key of [
      "country",
      "region",
      "postalCode",
      "pickupLocationId",
    ] as const) {
      const value = String(form.get(key) ?? "")
        .trim()
        .toUpperCase();
      if (value)
        requestContext[key] =
          key === "pickupLocationId" ? value.toLowerCase() : value;
    }
    const current = ++sequence.current;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setMessage("");
    setPreview(null);
    callback.current?.(null);
    try {
      const { response, data } = await fetchJson("/api/v1/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          context: requestContext,
          promotionCode: String(form.get("promotionCode") ?? ""),
        }),
        cache: "no-store",
        signal: active.signal,
      });
      if (!response.ok) throw new Error(responseMessage(data, m.checkFailed));
      const result = parseCommercePreview(responseData(data, true));
      if (sequence.current !== current) return;
      setPreview(result);
      setOptions(result);
      callback.current?.(result);
    } catch (error) {
      if (sequence.current === current)
        setMessage(
          locale === "zh"
            ? m.shoppingCheckFailed
            : error instanceof Error
              ? error.message
              : m.checkFailed,
        );
    } finally {
      if (sequence.current === current) setBusy(false);
    }
  }
  if (items.length > MAX_CART_LINES)
    return <p role="alert">{textFor(locale).errors.cartLineLimit}</p>;
  return (
    <section
      aria-label={m.shoppingOptions}
      className="my-5 rounded-xl border bg-muted/30 p-4"
    >
      <h2 className="mb-3 text-base font-medium">{m.shoppingTitle}</h2>
      <form
        onSubmit={check}
        onChange={invalidate}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className="grid gap-1 text-sm">
          {m.fulfillment}
          <NativeSelect
            disabled={loadingOptions || !options?.methods.length}
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            <option value="">{m.chooseMethod}</option>
            {(options?.methods ?? []).map((value) => (
              <option key={value} value={value}>
                {value === "pickup"
                  ? m.pickup
                  : value === "shipping"
                    ? m.shipping
                    : m.localDelivery}
              </option>
            ))}
          </NativeSelect>
        </label>
        {method === "pickup" ? (
          <label className="grid gap-1 text-sm">
            {m.pickupLocation}
            <NativeSelect name="pickupLocationId">
              <option value="">{m.chooseLocation}</option>
              {options?.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : (
          <>
            <label className="grid gap-1 text-sm">
              {m.country}
              <NativeSelect
                name="country"
                aria-label={m.country}
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                <option value="">{m.chooseCountry}</option>
                {destinations.countries.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-sm">
              {m.region}
              {country === "US" ? (
                <NativeSelect
                  name="region"
                  aria-label={m.region}
                  defaultValue=""
                >
                  <option value="">{m.chooseRegion}</option>
                  {destinations.states.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <Input key={country} name="region" maxLength={12} />
              )}
            </label>
            <label className="grid gap-1 text-sm">
              {m.postalCode}
              <Input name="postalCode" maxLength={24} />
            </label>
          </>
        )}
        <label className="grid gap-1 text-sm">
          {m.promotionCode}
          <Input name="promotionCode" maxLength={40} />
        </label>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            variant="outline"
            disabled={busy || loadingOptions || !options?.methods.length}
            aria-busy={busy || loadingOptions}
          >
            {busy ? m.checking : m.checkOptions}
          </Button>
        </div>
      </form>
      {optionsFailed && (
        <div className="mt-3 grid gap-2">
          <p role="alert">{m.shoppingCheckFailed}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOptionsRevision((value) => value + 1)}
          >
            {textFor(locale).ui.retryOptions}
          </Button>
        </div>
      )}
      {options && !options.methods.length && (
        <p role="status">{textFor(locale).checkoutDetails.noFulfillment}</p>
      )}
      {message && (
        <p role="alert" className="mt-3 text-sm">
          {message}
        </p>
      )}
      {preview && (
        <div className="mt-4 border-t pt-3">
          <CommerceSummary preview={preview} locale={locale} />
        </div>
      )}
    </section>
  );
}

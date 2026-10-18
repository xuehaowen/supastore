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
  const zh = locale === "zh";
  const [preview, setPreview] = useState<CommercePreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState("");
  const [country, setCountry] = useState("");
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
      if (!response.ok)
        throw new Error(
          responseMessage(
            data,
            zh
              ? "暂时无法检查，请重试。"
              : "Unable to check options. Please retry.",
          ),
        );
      const result = parseCommercePreview(responseData(data, true));
      if (sequence.current !== current) return;
      setPreview(result);
      setOptions(result);
      callback.current?.(result);
    } catch (error) {
      if (sequence.current === current)
        setMessage(
          zh
            ? "无法检查所选选项。请检查输入后重试。"
            : error instanceof Error
              ? error.message
              : "Unable to check options. Please retry.",
        );
    } finally {
      if (sequence.current === current) setBusy(false);
    }
  }
  if (items.length > MAX_CART_LINES)
    return <p role="alert">{textFor(locale).errors.cartLineLimit}</p>;
  return (
    <section
      aria-label={zh ? "购物选项" : "Shopping options"}
      className="my-5 rounded-xl border bg-muted/30 p-4"
    >
      <h2 className="mb-3 text-base font-medium">
        {zh ? "查看价格与购买条件" : "Check prices and shopping options"}
      </h2>
      <form
        onSubmit={check}
        onChange={invalidate}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className="grid gap-1 text-sm">
          {zh ? "配送方式" : "Fulfillment method"}
          <NativeSelect
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            <option value="">{zh ? "请选择" : "Choose method"}</option>
            {(options?.methods ?? ["shipping", "pickup", "local_delivery"]).map(
              (value) => (
                <option key={value} value={value}>
                  {value === "pickup"
                    ? zh
                      ? "自提"
                      : "Pickup"
                    : value === "shipping"
                      ? zh
                        ? "邮寄"
                        : "Shipping"
                      : zh
                        ? "本地配送"
                        : "Local delivery"}
                </option>
              ),
            )}
          </NativeSelect>
        </label>
        {method === "pickup" ? (
          <label className="grid gap-1 text-sm">
            {zh ? "自提地点" : "Pickup location"}
            <NativeSelect name="pickupLocationId">
              <option value="">
                {zh
                  ? "请选择地点（先检查以载入）"
                  : "Choose location (check to load)"}
              </option>
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
              {zh ? "国家" : "Country"}
              <NativeSelect
                name="country"
                aria-label={zh ? "国家" : "Country"}
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                <option value="">{zh ? "请选择国家" : "Choose country"}</option>
                {destinations.countries.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-sm">
              {zh ? "州 / 地区" : "State / region"}
              {country === "US" ? (
                <NativeSelect
                  name="region"
                  aria-label={zh ? "州 / 地区" : "State / region"}
                  defaultValue=""
                >
                  <option value="">{zh ? "请选择州" : "Choose state"}</option>
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
              {zh ? "邮政编码" : "ZIP or postal code"}
              <Input name="postalCode" maxLength={24} />
            </label>
          </>
        )}
        <label className="grid gap-1 text-sm">
          {zh ? "优惠码（可选）" : "Promotion code (optional)"}
          <Input name="promotionCode" maxLength={40} />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" variant="outline" disabled={busy}>
            {busy
              ? zh
                ? "检查中…"
                : "Checking…"
              : zh
                ? "检查选项"
                : "Check options"}
          </Button>
        </div>
      </form>
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

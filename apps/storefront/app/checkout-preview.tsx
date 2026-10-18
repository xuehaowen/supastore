"use client";
import { useEffect, useRef, useState } from "react";
import {
  parseCommercePreview,
  type CommercePreview,
  type CommercePreviewRequest,
} from "@supastore/contracts";
import { fetchJson } from "../lib/fetch-json";
import { responseData, responseMessage } from "../lib/response";
import { CommerceSummary } from "./commerce-summary";
import { Button } from "@supastore/ui/button";
export function CheckoutPreview({
  items,
  locale,
}: {
  items: CommercePreviewRequest["items"];
  locale: string;
}) {
  const [preview, setPreview] = useState<CommercePreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      current.current?.abort();
      current.current = null;
    },
    [],
  );
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async (event) => {
          const form = event.currentTarget.form;
          if (!form) return;
          const data = new FormData(form),
            context: CommercePreviewRequest["context"] = {};
          const method = String(data.get("fulfillmentType") ?? "");
          if (
            method === "shipping" ||
            method === "pickup" ||
            method === "local_delivery"
          )
            context.fulfillmentType = method;
          for (const key of [
            "country",
            "region",
            "postalCode",
            "pickupLocationId",
          ] as const) {
            const value = String(data.get(key) ?? "");
            if (value) context[key] = value;
          }
          const active = new AbortController();
          current.current?.abort();
          current.current = active;
          setBusy(true);
          setError("");
          setPreview(null);
          try {
            const { response, data: result } = await fetchJson(
              "/api/v1/evaluation",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  items,
                  context,
                  promotionCode: String(data.get("promotionCode") ?? ""),
                }),
                cache: "no-store",
                signal: active.signal,
              },
            );
            if (!response.ok)
              throw new Error(
                responseMessage(result, "Unable to check options."),
              );
            if (current.current === active)
              setPreview(parseCommercePreview(responseData(result, true)));
          } catch (failure) {
            if (current.current === active)
              setError(
                locale === "zh"
                  ? "无法检查，请确认输入后重试。"
                  : failure instanceof Error
                    ? failure.message
                    : "Unable to check options. Please retry.",
              );
          } finally {
            if (current.current === active) setBusy(false);
          }
        }}
      >
        {locale === "zh" ? "预览价格与积分" : "Preview prices and rewards"}
      </Button>
      {error && <p role="alert">{error}</p>}
      {preview && <CommerceSummary preview={preview} locale={locale} />}
    </div>
  );
}

"use client";
import { useState } from "react";
import Image from "next/image";
import type { ProductDetail } from "@/application/use-cases/catalog/get-product";
import { addItem } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProductPurchase({
  product,
  availableQuantities = {},
  locale,
  currency,
  precision,
  labels,
}: {
  product: ProductDetail;
  availableQuantities?: Record<string, number>;
  locale: string;
  currency: string;
  precision: number;
  labels: { quantity: string; add: string; unavailable: string };
}) {
  const initial =
    product.variants.find((v) => v.isAvailable) || product.variants[0];
  const [variantId, setVariantId] = useState(initial?.id || "");
  const current = product.variants.find((v) => v.id === variantId);
  const axes = [
    ...new Map(
      product.variants.flatMap((v) =>
        v.localizedAttributes.map((a) => [a.code, a] as const),
      ),
    ).values(),
  ];
  const normalized =
    axes.length > 0 &&
    product.variants.every((v) =>
      axes.every((a) => v.localizedAttributes.some((va) => va.code === a.code)),
    );
  const selected = new Map(
    current?.localizedAttributes.map((a) => [a.code, a.valueCode]) || [],
  );
  const image =
    product.images.find((i) => i.variantId === variantId) ||
    product.images.find((i) => i.variantId === null) ||
    product.images[0];
  const price = current
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      }).format(current.priceCents / 10 ** precision)
    : "";
  return (
    <div className="contents">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[1.5rem] bg-[#e5e8df] md:sticky md:top-6">
        {image ? (
          <Image
            className="size-full object-cover"
            src={`/api/assets?key=${encodeURIComponent(image.s3Key)}&inline=1`}
            alt={image.altText || product.title}
            width={800}
            height={800}
            sizes="(max-width: 767px) 88vw, 50vw"
          />
        ) : (
          <span
            className="font-serif text-8xl text-[#889475]"
            aria-hidden="true"
          >
            {product.title.slice(0, 1)}
          </span>
        )}
      </div>
      <div className="max-w-xl self-center">
        <p className="mb-5 text-[10px] font-bold tracking-[0.2em]">
          {product.categories.map((c) => c.name).join(" / ")}
        </p>
        <h1 className="mb-5 font-serif text-5xl leading-none tracking-[-0.045em] md:text-6xl">
          {product.title}
        </h1>
        <p className="mb-6 whitespace-pre-line leading-7 text-muted-foreground">
          {product.description}
        </p>
        <form className="grid gap-6" action={addItem}>
          <input type="hidden" name="locale" value={locale} />
          {normalized ? (
            <>
              <input
                type="hidden"
                name="variantId"
                value={current?.isAvailable ? variantId : ""}
              />
              {axes.map((axis, axisIndex) => {
                const values = [
                  ...new Map(
                    product.variants.flatMap((v) =>
                      v.localizedAttributes
                        .filter((a) => a.code === axis.code)
                        .map((a) => [a.valueCode, a] as const),
                    ),
                  ).values(),
                ];
                return (
                  <fieldset
                    key={axis.code}
                    className="grid gap-3 rounded-xl border bg-card p-4"
                  >
                    <legend className="px-2 text-sm font-medium">
                      {axis.name}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {values.map((value) => {
                        // Earlier selections constrain later axes; changing an earlier axis
                        // chooses a valid remaining combination instead of trapping sparse catalogs.
                        const match = product.variants.find(
                          (v) =>
                            v.isAvailable &&
                            axes
                              .slice(0, axisIndex + 1)
                              .every((a) =>
                                v.localizedAttributes.some(
                                  (va) =>
                                    va.code === a.code &&
                                    va.valueCode ===
                                      (a.code === axis.code
                                        ? value.valueCode
                                        : selected.get(a.code)),
                                ),
                              ),
                        );
                        return (
                          <Button
                            key={value.valueCode}
                            type="button"
                            variant={
                              selected.get(axis.code) === value.valueCode
                                ? "default"
                                : "outline"
                            }
                            aria-pressed={
                              selected.get(axis.code) === value.valueCode
                            }
                            disabled={!match}
                            onClick={() => match && setVariantId(match.id)}
                          >
                            {value.label}
                          </Button>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </>
          ) : (
            <fieldset className="grid gap-3 rounded-xl border bg-card p-4">
              <legend className="px-2 text-sm font-medium">
                {locale === "zh" ? "款式" : "Variant"}
              </legend>
              {product.variants.map((v) => (
                <Label
                  key={v.id}
                  className="flex items-start gap-3 font-normal"
                >
                  <input
                    className="mt-0.5 size-4 shrink-0"
                    type="radio"
                    name="variantId"
                    value={v.id}
                    disabled={!v.isAvailable}
                    required
                    checked={v.id === variantId}
                    onChange={() => setVariantId(v.id)}
                  />
                  <span>
                    {v.title}
                    {!v.isAvailable ? ` · ${labels.unavailable}` : ""}
                  </span>
                </Label>
              ))}
            </fieldset>
          )}
          <p role="status" aria-live="polite" className="text-lg font-medium">
            {current?.title} · {price}
            {!current?.isAvailable ? ` · ${labels.unavailable}` : ""}
          </p>
          {availableQuantities[variantId] !== undefined && (
            <p className="text-sm text-muted-foreground">
              {locale === "zh" ? "可购数量" : "Available quantity"}:{" "}
              {availableQuantities[variantId]}
            </p>
          )}
          <div className="grid max-w-32 gap-2">
            <Label>
              {labels.quantity}
              <Input
                type="number"
                name="quantity"
                min="1"
                max={Math.max(
                  1,
                  Math.min(999, availableQuantities[variantId] ?? 999),
                )}
                defaultValue="1"
                required
              />
            </Label>
          </div>
          <Button
            className="w-full sm:w-auto"
            size="lg"
            type="submit"
            disabled={!current?.isAvailable}
          >
            {current?.isAvailable ? labels.add : labels.unavailable}{" "}
            <span aria-hidden="true">↗</span>
          </Button>
        </form>
        <aside className="mt-8 border-t pt-5 text-sm leading-6 text-muted-foreground">
          {locale === "zh"
            ? "配送和到店自提选项将在结账时确认。"
            : "Shipping and local pickup options are confirmed at checkout."}
        </aside>
      </div>
    </div>
  );
}

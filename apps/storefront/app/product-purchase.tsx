"use client";
import { MAX_ITEM_QUANTITY } from "@supastore/contracts";
import { textFor } from "@supastore/i18n/messages";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import type { ProductDetail, CommercePreview } from "@supastore/contracts";
import dynamic from "next/dynamic";
import type { DestinationOptions } from "./shopping-preview";
const ShoppingPreview = dynamic(() =>
  import("./shopping-preview").then((module) => module.ShoppingPreview),
);
import { addItem } from "./actions";
import { Button } from "@supastore/ui/button";
import { Label } from "@supastore/ui/label";
import { variantCanBePurchased } from "../lib/product-availability";

export function ProductPurchase({
  product,
  availableQuantities = {},
  locale,
  currency,
  precision,
  labels,
  hasContextualRules = false,
  destinations,
}: {
  product: ProductDetail;
  availableQuantities?: Record<string, number>;
  locale: string;
  currency: string;
  precision: number;
  labels: { quantity: string; add: string; unavailable: string };
  hasContextualRules?: boolean;
  destinations?: DestinationOptions;
}) {
  const m = textFor(locale).commercePreview;
  const initial =
    product.variants.find((v) =>
      variantCanBePurchased(v, availableQuantities),
    ) || product.variants[0];
  const [variantId, setVariantId] = useState(initial?.id || "");
  const [activeImageKey, setActiveImageKey] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [shopping, setShopping] = useState<CommercePreview | null>(null);
  const current = product.variants.find((v) => v.id === variantId);
  const evaluated = shopping?.evaluation.items.find(
    (item) => item.variantId === variantId && item.quantity === quantity,
  );
  const canPurchase =
    variantCanBePurchased(current, availableQuantities) &&
    (!evaluated || evaluated.available);
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
  const variantImage =
    product.images.find((i) => i.variantId === variantId) ||
    product.images.find((i) => i.variantId === null) ||
    product.images[0];
  const activeImage =
    (activeImageKey
      ? product.images.find((i) => i.s3Key === activeImageKey)
      : null) || variantImage;
  const effectivePrice =
    hasContextualRules && evaluated
      ? evaluated.unitPriceCents
      : current?.priceCents;
  const price =
    effectivePrice !== null && effectivePrice !== undefined
      ? new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        }).format(effectivePrice / 10 ** precision)
      : m.chooseOptionsForPrice;
  const maxQty = Math.max(
    1,
    Math.min(
      MAX_ITEM_QUANTITY,
      availableQuantities[variantId] ?? MAX_ITEM_QUANTITY,
    ),
  );
  const selectedQuantity = Math.min(quantity, maxQty);
  function selectVariant(id: string) {
    setVariantId(id);
    setQuantity((q) =>
      Math.max(
        1,
        Math.min(
          q,
          MAX_ITEM_QUANTITY,
          availableQuantities[id] ?? MAX_ITEM_QUANTITY,
        ),
      ),
    );
    setActiveImageKey(null);
  }
  return (
    <div className="contents">
      <div className="flex flex-col gap-3 md:sticky md:top-6">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-[#e5e8df]">
          {activeImage ? (
            <Image
              className="size-full object-cover transition-all duration-300"
              src={`/api/assets?key=${encodeURIComponent(activeImage.s3Key)}&inline=1`}
              alt={activeImage.altText || product.title}
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
        {product.images.length > 1 && (
          <div
            className="flex gap-2.5 overflow-x-auto pb-1"
            aria-label={textFor(locale).ui.productImageGallery}
          >
            {product.images.map((img) => {
              const isSelected = activeImage?.s3Key === img.s3Key;
              return (
                <button
                  key={img.s3Key}
                  type="button"
                  onClick={() => setActiveImageKey(img.s3Key)}
                  className={`relative size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  aria-pressed={isSelected}
                  aria-label={img.altText || product.title}
                >
                  <Image
                    className="size-full object-cover"
                    src={`/api/assets?key=${encodeURIComponent(img.s3Key)}&inline=1`}
                    alt=""
                    width={80}
                    height={80}
                  />
                </button>
              );
            })}
          </div>
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
        {hasContextualRules && current && (
          <ShoppingPreview
            items={[{ variantId, quantity: selectedQuantity }]}
            locale={locale}
            destinations={destinations}
            onEvaluation={setShopping}
          />
        )}
        <form className="grid gap-6" action={addItem}>
          <input type="hidden" name="locale" value={locale} />
          {normalized ? (
            <>
              <input
                type="hidden"
                name="variantId"
                value={canPurchase ? variantId : ""}
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
                            variantCanBePurchased(v, availableQuantities) &&
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
                            onClick={() => match && selectVariant(match.id)}
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
                {textFor(locale).ui.variant}
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
                    disabled={!variantCanBePurchased(v, availableQuantities)}
                    required
                    checked={v.id === variantId}
                    onChange={() => selectVariant(v.id)}
                  />
                  <span>
                    {v.title}
                    {!variantCanBePurchased(v, availableQuantities)
                      ? ` · ${labels.unavailable}`
                      : ""}
                  </span>
                </Label>
              ))}
            </fieldset>
          )}
          <p role="status" aria-live="polite" className="text-lg font-medium">
            {hasContextualRules && !evaluated && (
              <small className="block text-xs text-muted-foreground">
                {m.basePriceNotice}
              </small>
            )}
            {current?.title} · {price}
            {!canPurchase ? ` · ${labels.unavailable}` : ""}
          </p>
          {availableQuantities[variantId] !== undefined && (
            <p className="text-sm text-muted-foreground">
              {textFor(locale).ui.availableQuantity}:{" "}
              {availableQuantities[variantId]}
            </p>
          )}
          <div className="grid gap-2">
            <Label>{labels.quantity}</Label>
            <div className="inline-flex items-center rounded-lg border bg-background p-1 w-fit">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                disabled={selectedQuantity <= 1}
                onClick={() => setQuantity(Math.max(1, selectedQuantity - 1))}
                aria-label={textFor(locale).ui.decreaseQuantity}
              >
                −
              </Button>
              <input type="hidden" name="quantity" value={selectedQuantity} />
              <span className="w-12 text-center text-sm font-medium tabular-nums">
                {selectedQuantity}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                disabled={selectedQuantity >= maxQty}
                onClick={() =>
                  setQuantity(Math.min(maxQty, selectedQuantity + 1))
                }
                aria-label={textFor(locale).ui.increaseQuantity}
              >
                +
              </Button>
            </div>
          </div>
          <AddToCartButton
            available={canPurchase}
            labels={labels}
            wait={textFor(locale).common.wait}
          />
        </form>
        <aside className="mt-8 border-t pt-5 text-sm leading-6 text-muted-foreground">
          {
            textFor(locale).ui
              .shippingAndLocalPickupOptionsAreConfirmedAtCheckout
          }
        </aside>
      </div>
    </div>
  );
}

function AddToCartButton({
  available,
  labels,
  wait,
}: {
  available: boolean;
  labels: { add: string; unavailable: string };
  wait: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      className="w-full sm:w-auto"
      size="lg"
      type="submit"
      disabled={!available || pending}
      aria-busy={pending}
    >
      {pending ? wait : available ? labels.add : labels.unavailable}{" "}
      <span aria-hidden="true">↗</span>
    </Button>
  );
}

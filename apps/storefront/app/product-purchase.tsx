"use client";
import Link from "next/link";
import { Package, ZoomIn } from "lucide-react";
import { designCopy } from "../lib/design-copy";
import { MAX_ITEM_QUANTITY } from "@supastore/contracts";
import { textFor } from "@supastore/i18n/messages";
import {
  startTransition,
  useActionState,
  useState,
  useRef,
  useId,
  useEffect,
  type RefObject,
} from "react";
import Image from "next/image";
import type { ProductDetail, CommercePreview } from "@supastore/contracts";
import dynamic from "next/dynamic";
import type { DestinationOptions } from "./shopping-preview";
const ProductVariantOptions = dynamic(
  () => import("./product-variant-options"),
);
const ProductImageZoom = dynamic(() => import("./product-image-zoom"), {
  ssr: false,
});
const ShoppingPreview = dynamic(() =>
  import("./shopping-preview").then((module) => module.ShoppingPreview),
);
import { addItem } from "./actions";
import { Button } from "@supastore/ui/button";
import { Separator } from "@supastore/ui/separator";
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
  specifications = [],
}: {
  product: ProductDetail;
  availableQuantities?: Record<string, number>;
  locale: string;
  currency: string;
  precision: number;
  labels: { quantity: string; add: string; unavailable: string };
  hasContextualRules?: boolean;
  destinations?: DestinationOptions;
  specifications?: { valueId: string; name: string; label: string }[];
}) {
  const m = textFor(locale).commercePreview;
  const copy = designCopy(locale);
  const [addState, addAction, adding] = useActionState(addItem, {});
  const initial =
    product.variants.find((v) =>
      variantCanBePurchased(v, availableQuantities),
    ) || product.variants[0];
  const [variantId, setVariantId] = useState(initial?.id || "");
  const [confirmedOptions, setConfirmedOptions] = useState<
    Record<string, string>
  >({});
  const [variantConfirmed, setVariantConfirmed] = useState(false);
  const optionFields = useRef<HTMLDivElement>(null);
  const [activeImageKey, setActiveImageKey] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomLoaded, setZoomLoaded] = useState(false);
  const zoomTrigger = useRef<HTMLButtonElement>(null);
  const purchaseButton = useRef<HTMLButtonElement>(null);
  const purchaseFormId = useId();
  const [showSticky, setShowSticky] = useState(false);
  useEffect(() => {
    const button = purchaseButton.current;
    if (!button) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = button.getBoundingClientRect();
        setShowSticky(bounds.bottom <= 0 || bounds.top >= window.innerHeight);
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(button);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
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
  const needsOptions =
    product.variants.length > 1 &&
    (normalized
      ? axes.some((axis) => {
          const values = new Set(
            product.variants.flatMap((v) =>
              v.localizedAttributes
                .filter((a) => a.code === axis.code)
                .map((a) => a.valueCode),
            ),
          );
          return (
            values.size > 1 &&
            confirmedOptions[axis.code] !== selected.get(axis.code)
          );
        })
      : !variantConfirmed);
  const chooseOptions = textFor(locale).ui.chooseProductOptions;
  function focusOptions() {
    optionFields.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    optionFields.current
      ?.querySelector<HTMLButtonElement>(
        'button:not(:disabled), [role="radio"]:not(:disabled)',
      )
      ?.focus({ preventScroll: true });
  }
  const purchaseLabel = adding
    ? textFor(locale).common.wait
    : !canPurchase
      ? labels.unavailable
      : needsOptions
        ? chooseOptions
        : labels.add;
  const variantImage =
    product.images.find((i) => i.variantId === variantId) ||
    product.images.find((i) => i.variantId === null) ||
    product.images[0];
  const activeImage =
    (activeImageKey
      ? product.images.find((i) => i.s3Key === activeImageKey)
      : null) || variantImage;
  const imageIndex = Math.max(
    0,
    product.images.findIndex((image) => image.s3Key === activeImage?.s3Key),
  );
  const gesture = useRef<{ x: number; y: number } | null>(null);
  function nextImage(offset: number) {
    const image =
      product.images[
        (imageIndex + offset + product.images.length) % product.images.length
      ];
    if (image) setActiveImageKey(image.s3Key);
  }
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
      <div className="product-gallery">
        <div
          className="product-main-image"
          style={{ touchAction: "pan-y" }}
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse")
              gesture.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerCancel={() => {
            gesture.current = null;
          }}
          onPointerUp={(event) => {
            const start = gesture.current;
            gesture.current = null;
            if (!start || product.images.length < 2) return;
            const dx = event.clientX - start.x,
              dy = event.clientY - start.y;
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy))
              nextImage(dx < 0 ? 1 : -1);
          }}
        >
          {activeImage && (
            <Button
              ref={zoomTrigger}
              className="product-zoom-trigger"
              type="button"
              variant="outline"
              aria-label={textFor(locale).ui.enlargeImage}
              onClick={() => {
                setZoomLoaded(true);
                setZoomOpen(true);
              }}
            >
              <ZoomIn aria-hidden="true" />
              {textFor(locale).ui.enlargeImage}
            </Button>
          )}
          {activeImage ? (
            <Image
              className="size-full object-cover transition-all duration-300"
              src={`/api/assets?key=${encodeURIComponent(activeImage.s3Key)}&inline=1`}
              alt={activeImage.altText || product.title}
              width={800}
              height={800}
              sizes="(max-width: 767px) 88vw, 50vw"
              priority={activeImage.s3Key === variantImage?.s3Key}
            />
          ) : (
            <span className="product-image-placeholder">
              <Package aria-hidden="true" />
              <span>{copy.noImage}</span>
            </span>
          )}
        </div>
        {zoomLoaded && (
          <ProductImageZoom
            open={zoomOpen}
            onOpenChange={setZoomOpen}
            triggerRef={zoomTrigger}
            images={product.images}
            index={imageIndex}
            title={product.title}
            locale={locale}
            onNavigate={nextImage}
          />
        )}
        {product.images.length > 1 && (
          <>
            <div
              className="product-gallery-controls"
              role="group"
              aria-label={textFor(locale).ui.productImageGallery}
            >
              <Button
                type="button"
                variant="outline"
                aria-label={copy.previousPhoto}
                onClick={() => nextImage(-1)}
              >
                ←
              </Button>
              <span role="status">
                {copy.photo} {imageIndex + 1} / {product.images.length}
              </span>
              <Button
                type="button"
                variant="outline"
                aria-label={copy.nextPhoto}
                onClick={() => nextImage(1)}
              >
                →
              </Button>
            </div>
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
          </>
        )}
      </div>
      <div className="product-purchase-info">
        <p className="mb-5 text-[10px] font-bold tracking-[0.2em]">
          {product.categories.map((c) => c.name).join(" / ")}
        </p>
        <h1 className="mb-5 font-serif text-5xl leading-none tracking-[-0.045em] md:text-6xl">
          {product.title}
        </h1>
        <p role="status" aria-live="polite" className="product-price">
          {price}
          {!canPurchase ? ` · ${labels.unavailable}` : ""}
        </p>
        <p className="mb-6 leading-7 text-muted-foreground">
          {Array.from(product.description || "")
            .slice(0, 180)
            .join("")}
          {Array.from(product.description || "").length > 180 ? "…" : ""}
        </p>
        {specifications.length > 0 && (
          <section
            className="product-key-specs"
            aria-labelledby="product-specifications"
          >
            <h2 id="product-specifications">
              {textFor(locale).ui.specifications}
            </h2>
            <dl>
              {specifications.slice(0, 4).map((spec) => (
                <div key={spec.valueId}>
                  <dt>{spec.name}</dt>
                  <dd>{spec.label}</dd>
                </div>
              ))}
            </dl>
            {specifications.length > 4 && (
              <a href="#all-specifications">
                {textFor(locale).ui.allSpecifications}
              </a>
            )}
          </section>
        )}
        {hasContextualRules && current && (
          <ShoppingPreview
            items={[{ variantId, quantity: selectedQuantity }]}
            locale={locale}
            destinations={destinations}
            onEvaluation={setShopping}
          />
        )}
        <form
          id={purchaseFormId}
          className="grid gap-6"
          action={addAction}
          onSubmit={(event) => {
            event.preventDefault();
            if (needsOptions) {
              focusOptions();
              return;
            }
            if (!adding && canPurchase) {
              const data = new FormData(event.currentTarget);
              startTransition(() => addAction(data));
            }
          }}
        >
          <input type="hidden" name="locale" value={locale} />
          <div ref={optionFields} className="grid gap-6">
            {normalized ? (
              <>
                <input
                  type="hidden"
                  name="variantId"
                  value={canPurchase && !needsOptions ? variantId : ""}
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
                                selected.get(axis.code) === value.valueCode &&
                                (product.variants.length === 1 ||
                                  values.length === 1 ||
                                  confirmedOptions[axis.code] ===
                                    value.valueCode)
                                  ? "default"
                                  : "outline"
                              }
                              aria-pressed={
                                selected.get(axis.code) === value.valueCode &&
                                (product.variants.length === 1 ||
                                  values.length === 1 ||
                                  confirmedOptions[axis.code] ===
                                    value.valueCode)
                              }
                              disabled={!match}
                              onClick={() => {
                                if (!match) return;
                                selectVariant(match.id);
                                setConfirmedOptions((previous) => ({
                                  ...Object.fromEntries(
                                    Object.entries(previous).filter(
                                      ([code, confirmed]) =>
                                        match.localizedAttributes.some(
                                          (a) =>
                                            a.code === code &&
                                            a.valueCode === confirmed,
                                        ),
                                    ),
                                  ),
                                  [axis.code]: value.valueCode,
                                }));
                              }}
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
                <input
                  type="hidden"
                  name="variantId"
                  value={canPurchase && !needsOptions ? variantId : ""}
                />
                <ProductVariantOptions
                  variants={product.variants}
                  selected={
                    product.variants.length === 1 || variantConfirmed
                      ? variantId
                      : ""
                  }
                  quantities={availableQuantities}
                  onSelect={(id) => {
                    selectVariant(id);
                    setVariantConfirmed(true);
                  }}
                  label={textFor(locale).ui.variant}
                  unavailable={labels.unavailable}
                />
              </fieldset>
            )}
          </div>
          {needsOptions && (
            <p className="text-sm text-muted-foreground" role="status">
              {chooseOptions}
            </p>
          )}
          {hasContextualRules && !evaluated && (
            <small className="text-muted-foreground">{m.basePriceNotice}</small>
          )}
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
            buttonRef={purchaseButton}
            available={canPurchase}
            pending={adding}
            labels={{
              ...labels,
              add: needsOptions ? chooseOptions : labels.add,
            }}
            wait={textFor(locale).common.wait}
          />
          {addState.error && (
            <p role="alert" className="text-sm text-destructive">
              {addState.error}
            </p>
          )}
          {addState.saved && (
            <div role="status" aria-live="polite" className="purchase-feedback">
              <span>{copy.added}</span>
              <Link className="underline" href={`/${locale}/cart`}>
                {copy.viewBag}
              </Link>
            </div>
          )}
        </form>
        {showSticky && (
          <aside
            className="mobile-purchase-bar"
            aria-label={textFor(locale).ui.quickPurchase}
          >
            <div>
              <p className="font-medium">{product.title}</p>
              {product.variants.length > 1 && (
                <p className="text-sm">
                  {needsOptions
                    ? chooseOptions
                    : current?.localizedAttributes.length
                      ? current.localizedAttributes
                          .map((a) => `${a.name}: ${a.label}`)
                          .join(" · ")
                      : current?.title}
                </p>
              )}
              <p className="text-sm">
                {price} · {labels.quantity}: {selectedQuantity}
              </p>
            </div>
            <Button
              type={needsOptions ? "button" : "submit"}
              onClick={needsOptions ? focusOptions : undefined}
              form={purchaseFormId}
              size="lg"
              disabled={!canPurchase || adding}
              aria-busy={adding}
              aria-label={`${textFor(locale).ui.quickPurchase} · ${purchaseLabel}`}
            >
              {purchaseLabel}
            </Button>
          </aside>
        )}
        <Separator className="mt-8" />
        <aside className="pt-5 text-sm leading-6 text-muted-foreground">
          {
            textFor(locale).ui
              .shippingAndLocalPickupOptionsAreConfirmedAtCheckout
          }
        </aside>
        <div className="product-policies">
          <Link href={`/${locale}/pages/shipping`}>{copy.shipping}</Link>
          <Link href={`/${locale}/pages/returns`}>{copy.returns}</Link>
        </div>
        {Array.from(product.description || "").length > 180 && (
          <details className="storefront-disclosure mt-8">
            <summary>
              {copy.details}
              <span aria-hidden="true">+</span>
            </summary>
            <div className="whitespace-pre-line">{product.description}</div>
          </details>
        )}
      </div>
    </div>
  );
}

function AddToCartButton({
  buttonRef,
  available,
  labels,
  wait,
  pending,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  available: boolean;
  labels: { add: string; unavailable: string };
  wait: string;
  pending: boolean;
}) {
  return (
    <Button
      ref={buttonRef}
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

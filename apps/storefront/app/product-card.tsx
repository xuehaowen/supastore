import { Package } from "lucide-react";
import { designCopy } from "../lib/design-copy";
import Image from "next/image";
import Link from "next/link";
import { money } from "../lib/web";
import { NavigationPending } from "./navigation-pending";
import { ProductImagePreview } from "./product-image-preview";
import { textFor } from "@supastore/i18n/messages";

export function ProductCard({
  product,
  locale,
  currency,
  precision,
  hasContextualRules = false,
}: {
  product: {
    id: string;
    handle: string;
    title: string;
    coverImageKey: string | null;
    previewImageKey?: string | null;
    lowestPriceCents: number | null;
    highestPriceCents?: number | null;
    isAvailable?: boolean;
  };
  locale: string;
  currency?: string | undefined;
  precision?: number | undefined;
  hasContextualRules?: boolean;
}) {
  const m = textFor(locale).commercePreview;
  const href = `/${locale}/products/${product.handle}`;
  const keys = [product.coverImageKey, product.previewImageKey].filter(
    (key): key is string => !!key,
  );
  const photographs = keys.map((key) => (
    <Link key={key} href={href}>
      <Image
        src={`/api/assets?key=${encodeURIComponent(key)}&inline=1`}
        alt={product.title}
        width={600}
        height={600}
        sizes="(max-width: 639px) 44vw, (max-width: 1023px) 42vw, 28vw"
        className="size-full object-cover"
      />
      <NavigationPending label={textFor(locale).common.wait} />
    </Link>
  ));
  return (
    <article className="storefront-product-card group">
      <div className="storefront-product-image">
        {keys.length > 1 ? (
          <ProductImagePreview
            label={`${designCopy(locale).photo} · ${product.title}`}
          >
            {photographs}
          </ProductImagePreview>
        ) : product.coverImageKey ? (
          photographs[0]
        ) : (
          <Link href={href} aria-label={product.title}>
            <span className="product-image-placeholder">
              <Package aria-hidden="true" />
              <span>{designCopy(locale).noImage}</span>
            </span>
            <NavigationPending label={textFor(locale).common.wait} />
          </Link>
        )}
      </div>
      <Link className="block no-underline" href={href}>
        <div className="storefront-product-meta">
          <h3>{product.title}</h3>
          <span>
            {hasContextualRules && (
              <small className="block text-xs text-muted-foreground">
                {m.basePriceNotice}
              </small>
            )}
            {product.lowestPriceCents === null
              ? "—"
              : `${product.highestPriceCents != null && product.highestPriceCents > product.lowestPriceCents ? `${textFor(locale).ui.priceFrom} ` : ""}${money(product.lowestPriceCents, currency, precision, locale)}`}
            {product.isAvailable === false && (
              <small className="block text-xs text-muted-foreground">
                {textFor(locale).unavailable}
              </small>
            )}
          </span>
        </div>
        <NavigationPending label={textFor(locale).common.wait} />
      </Link>
    </article>
  );
}

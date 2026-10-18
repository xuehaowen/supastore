import Image from "next/image";
import Link from "next/link";
import { money } from "../lib/web";
import { NavigationPending } from "./navigation-pending";
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
    lowestPriceCents: number | null;
  };
  locale: string;
  currency?: string | undefined;
  precision?: number | undefined;
  hasContextualRules?: boolean;
}) {
  return (
    <article className="storefront-product-card group">
      <Link
        className="block no-underline"
        href={`/${locale}/products/${product.handle}`}
      >
        <div className="storefront-product-image">
          {product.coverImageKey ? (
            <Image
              src={`/api/assets?key=${encodeURIComponent(product.coverImageKey)}&inline=1`}
              alt={product.title}
              width={600}
              height={600}
              sizes="(max-width: 639px) 44vw, (max-width: 1023px) 42vw, 28vw"
              className="size-full object-cover transition-transform duration-300 motion-reduce:transition-none group-hover:scale-[1.025]"
            />
          ) : (
            <span
              aria-hidden="true"
              className="font-serif text-7xl text-muted-foreground"
            >
              {product.title.slice(0, 1)}
            </span>
          )}
        </div>
        <div className="storefront-product-meta">
          <h3>{product.title}</h3>
          <span>
            {hasContextualRules && (
              <small className="block text-xs text-muted-foreground">
                {locale === "zh"
                  ? "基础价格，选项可能影响售价"
                  : "Base price; options may change price"}
              </small>
            )}
            {product.lowestPriceCents === null
              ? "—"
              : money(product.lowestPriceCents, currency, precision, locale)}
          </span>
        </div>
        <NavigationPending label={textFor(locale).common.wait} />
      </Link>
    </article>
  );
}

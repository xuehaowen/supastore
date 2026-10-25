import type { CustomerPageModels } from "@supastore/contracts";
import { textFor } from "@supastore/i18n/messages";
import { designCopy } from "../lib/design-copy";
import { ProductCard } from "./product-card";
import Link from "./shopping-link";

export function HomeProducts({
  locale,
  catalog,
}: {
  locale: string;
  catalog: CustomerPageModels["catalog"];
}) {
  const m = designCopy(locale);
  const selectedIds = catalog.store?.storefrontHero?.featuredProductIds ?? [];
  const hasSelectedProducts = catalog.result.items.some((product) =>
    selectedIds.includes(product.id),
  );
  return (
    <section
      id="products"
      className="home-products"
      aria-labelledby="home-products-heading"
    >
      <div className="storefront-catalog-tools home-catalog-tools">
        <h2 id="home-products-heading">
          {hasSelectedProducts ? m.selectedProducts : m.latestProducts}
        </h2>
        <Link href={`/${locale}/search`}>{m.shopAllProducts} →</Link>
      </div>
      <div className="storefront-product-grid">
        {catalog.result.items.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            locale={locale}
            currency={catalog.store?.currency}
            precision={catalog.store?.precision}
            hasContextualRules={catalog.store?.hasContextualRules ?? false}
          />
        ))}
      </div>
      {!catalog.result.items.length && (
        <p>{textFor(locale).common.noProducts}</p>
      )}
    </section>
  );
}

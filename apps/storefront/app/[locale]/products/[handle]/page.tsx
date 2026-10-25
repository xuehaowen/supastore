import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@supastore/ui/breadcrumb";
import { publicOrigin } from "../../../../lib/seo";
import { publicPageMetadata } from "../../../../lib/page-metadata";
import { BackendApiError } from "../../../../lib/api";
import { readProductPage } from "../../../../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import { ProductPurchase } from "../../../product-purchase";
import { RecentlyViewed } from "../../../recently-viewed";
import { getTranslations } from "next-intl/server";
import { variantCanBePurchased } from "../../../../lib/product-availability";
import { countryOptions, stateOptions } from "@supastore/shipping/destination";
export default async function Product({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  const t = await getTranslations({ locale });
  const {
    purchasable: p,
    store,
    availableQuantities,
    specs,
  } = await readProductPage(locale, handle);
  const purchasable = p;
  const base = publicOrigin().replace(/\/$/, "");
  const structured = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.description,
    image: p.images.map(
      (i) => `${base}/api/assets?key=${encodeURIComponent(i.s3Key)}`,
    ),
    offers: store?.hasContextualRules
      ? undefined
      : purchasable.variants.map((v) => ({
          "@type": "Offer",
          sku: v.sku,
          priceCurrency: store?.currency || "USD",
          price: (v.priceCents / 10 ** (store?.precision ?? 2)).toFixed(
            store?.precision ?? 2,
          ),
          availability: `https://schema.org/${variantCanBePurchased(v, availableQuantities) ? "InStock" : "OutOfStock"}`,
          url: `${base}/${locale}/products/${encodeURIComponent(handle)}`,
        })),
  };
  return (
    <section className="product-layout">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
        }}
      />
      <Breadcrumb aria-label={textFor(locale).shop}>
        <BreadcrumbList>
          <BreadcrumbItem>
            <Link href={`/${locale}/search`}>{t("all")}</Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{p.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ProductPurchase
        specifications={specs}
        product={purchasable}
        hasContextualRules={store?.hasContextualRules ?? false}
        destinations={
          store?.hasContextualRules
            ? {
                countries: countryOptions(locale),
                states: stateOptions(locale),
              }
            : { countries: [], states: [] }
        }
        availableQuantities={availableQuantities}
        locale={locale}
        currency={store?.currency || "USD"}
        precision={store?.precision ?? 2}
        labels={{
          quantity: t("quantity"),
          add: t("add"),
          unavailable: t("unavailable"),
        }}
      />
      {specs.length > 4 && (
        <section
          id="all-specifications"
          className="md:col-span-2 scroll-mt-6"
          tabIndex={-1}
        >
          <h2 className="mb-4 text-lg font-medium">
            {textFor(locale).ui.specifications}
          </h2>
          <dl className="grid gap-3">
            {specs.map((s) => (
              <div key={s.valueId} className="grid grid-cols-2 border-b py-2">
                <dt>{s.name}</dt>
                <dd>{s.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <RecentlyViewed locale={locale} handle={handle} title={p.title} />
    </section>
  );
}

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  const data = await readProductPage(locale, handle).catch((error) => {
    if (error instanceof BackendApiError && error.status === 404) return null;
    throw error;
  });
  const p = data?.purchasable;
  return {
    ...publicPageMetadata({
      locale,
      path: "/products/" + encodeURIComponent(handle),
      title: p?.title || textFor(locale).common.productNotFound,
      storeName: data?.store?.storeName,
      description: p?.description,
    }),
    robots: p ? undefined : { index: false, follow: false },
  };
}
export function generateStaticParams() {
  return [];
}

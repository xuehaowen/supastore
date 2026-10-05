import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { getProduct } from "@/application/use-cases/catalog/get-product";
import { NotFoundError } from "@/application/common/errors";
import { db } from "@/infrastructure/db";
import { storeSettings, variantStock } from "@/infrastructure/db/schema";
import { inArray } from "drizzle-orm";
import { listSpecifications } from "@/application/use-cases/catalog/manage-specifications";
import { ProductPurchase } from "@/app/product-purchase";
import { getTranslations } from "next-intl/server";
const product = unstable_cache(getProduct, ["public-product"], {
  tags: ["catalog"],
  revalidate: 3600,
});
export default async function Product({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  const t = await getTranslations({ locale });
  const p = await product({ handle, locale }).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [store] = await db.select().from(storeSettings).limit(1);
  const stock = p.variants.length
    ? await db
        .select()
        .from(variantStock)
        .where(
          inArray(
            variantStock.variantId,
            p.variants.map((v) => v.id),
          ),
        )
    : [];
  const availableQuantities = Object.fromEntries(
    stock
      .filter((s) => s.trackingEnabled)
      .map((s) => [s.variantId, Math.max(0, s.onHand - s.reserved)]),
  );
  const purchasable = {
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      isAvailable:
        v.isAvailable &&
        (availableQuantities[v.id] === undefined ||
          availableQuantities[v.id]! > 0),
    })),
  };
  const specs = await listSpecifications(
    p.id,
    locale,
    store?.defaultLocale || "en",
  );
  const base = (process.env.APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const structured = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.description,
    image: p.images.map(
      (i) => `${base}/api/assets?key=${encodeURIComponent(i.s3Key)}`,
    ),
    offers: purchasable.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      priceCurrency: store?.currency || "USD",
      price: (v.priceCents / 10 ** (store?.precision ?? 2)).toFixed(
        store?.precision ?? 2,
      ),
      availability: `https://schema.org/${v.isAvailable ? "InStock" : "OutOfStock"}`,
      url: `${base}/${locale}/products/${encodeURIComponent(handle)}`,
    })),
  };
  return (
    <section className="grid gap-10 py-10 md:grid-cols-[1.1fr_1fr] md:gap-14 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
        }}
      />
      <ProductPurchase
        product={purchasable}
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
      {specs.length > 0 && (
        <section className="md:col-span-2">
          <h2 className="mb-4 text-lg font-medium">
            {locale === "zh" ? "商品规格" : "Specifications"}
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
  const p = await product({ handle, locale }).catch(() => null);
  const base = (process.env.APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return {
    title: p?.title || "Product not found",
    description: p?.description.slice(0, 160),
    alternates: {
      canonical: `${base}/${locale}/products/${encodeURIComponent(handle)}`,
      languages: {
        en: `${base}/en/products/${encodeURIComponent(handle)}`,
        zh: `${base}/zh/products/${encodeURIComponent(handle)}`,
      },
    },
    robots: p ? undefined : { index: false, follow: false },
  };
}
export function generateStaticParams() {
  return [];
}

import Image from "next/image";
import { notFound } from "next/navigation";
import {
  BackendApiError,
  readApi,
  type Product,
  type Store,
} from "../../../../lib/api";
import { AddToCart } from "../../../commerce";
import { alternateLinks, publicOrigin, safeJsonLd } from "../../../../lib/seo";
import { getStorefrontMessages } from "../../../../lib/i18n";
async function readProduct(locale: string, handle: string) {
  try {
    return await readApi<Product>(
      `products/${encodeURIComponent(handle)}?locale=${locale}`,
    );
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) notFound();
    throw error;
  }
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  const product = await readProduct(locale, handle);
  const path = `/products/${encodeURIComponent(handle)}`;
  return {
    title: product.title,
    description: product.description.slice(0, 160),
    alternates: {
      canonical: `${publicOrigin()}/${locale}${path}`,
      languages: alternateLinks(path),
    },
    openGraph: {
      title: product.title,
      description: product.description.slice(0, 160),
      url: `${publicOrigin()}/${locale}${path}`,
      type: "website",
      images: product.images.map(
        (i) =>
          `${publicOrigin()}/api/assets?key=${encodeURIComponent(i.s3Key)}`,
      ),
    },
  };
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  const m = getStorefrontMessages(locale);
  const [product, store] = await Promise.all([
    readProduct(locale, handle),
    readApi<Store>("store"),
  ]);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.title,
            description: product.description,
            url: `${publicOrigin()}/${locale}/products/${encodeURIComponent(handle)}`,
            image: product.images.map(
              (i) =>
                `${publicOrigin()}/api/assets?key=${encodeURIComponent(i.s3Key)}`,
            ),
            offers: product.variants.map((v) => ({
              "@type": "Offer",
              priceCurrency: store.currency,
              price: (v.priceCents / 10 ** store.precision).toFixed(
                store.precision,
              ),
              availability: `https://schema.org/${v.isAvailable ? "InStock" : "OutOfStock"}`,
              url: `${publicOrigin()}/${locale}/products/${encodeURIComponent(handle)}`,
            })),
          }),
        }}
      />
      <h1>{product.title}</h1>
      <div className="grid">
        <div>
          {product.images.map((i) => (
            <Image
              key={i.s3Key}
              src={`/api/assets?key=${encodeURIComponent(i.s3Key)}`}
              alt={i.altText || product.title}
              width={600}
              height={600}
              unoptimized
              style={{ width: "100%", height: "auto" }}
            />
          ))}
          <p>{product.description}</p>
        </div>
        <AddToCart
          product={product}
          store={store}
          locale={locale}
          messages={m.product}
        />
      </div>
    </>
  );
}

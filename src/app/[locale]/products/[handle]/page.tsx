import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { getProduct } from "@/application/use-cases/catalog/get-product";
import { NotFoundError } from "@/application/common/errors";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { addItem } from "@/app/actions";
import { Hidden } from "@/app/components";
import { getTranslations } from "next-intl/server";
import { money } from "@/infrastructure/web";
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
  const t = await getTranslations({locale});
  const p = await product({ handle, locale }).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [store] = await db.select().from(storeSettings).limit(1);
  return (
    <section className="product-detail">
      <div className="product-image tone-1">
        {p.images[0] ? (
          <img
            src={"/api/assets?key=" + encodeURIComponent(p.images[0].s3Key)}
            alt={p.images[0].altText || p.title}
            width="800"
            height="800"
          />
        ) : (
          <span aria-hidden="true">{p.title.slice(0, 1)}</span>
        )}
      </div>
      <div>
        <p className="eyebrow">
          {p.categories.map((c) => c.name).join(" / ") || "THE COLLECTION"}
        </p>
        <h1>{p.title}</h1>
        <p className="description">{p.description}</p>
        <form action={addItem}>
          <Hidden name="locale" value={locale} />
          <label>
            Variant
            <select name="variantId">
              {p.variants.map((v) => (
                <option key={v.id} value={v.id} disabled={!v.isAvailable}>
                  {v.title} —{" "}
                  {money(v.priceCents, store?.currency, store?.precision)}
                  {!v.isAvailable ? " · " + t("unavailable") : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("quantity")}
            <input
              type="number"
              name="quantity"
              min="1"
              max="999"
              defaultValue="1"
              required
            />
          </label>
          <button disabled={!p.variants.some((v) => v.isAvailable)}>
            {p.variants.some((v) => v.isAvailable) ? t("add") : t("unavailable")} ↗
          </button>
        </form>
        <p className="muted">Shipping and local pickup options at checkout.</p>
      </div>
    </section>
  );
}

export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

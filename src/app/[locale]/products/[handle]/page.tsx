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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  return (
    <section className="grid gap-10 py-10 md:grid-cols-[1.1fr_1fr] md:gap-14 md:py-14">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[1.5rem] bg-[#e5e8df] md:sticky md:top-6">
        {p.images[0] ? (
          <img className="size-full object-cover"
            src={"/api/assets?key=" + encodeURIComponent(p.images[0].s3Key)}
            alt={p.images[0].altText || p.title}
            width="800"
            height="800"
            sizes="(max-width: 767px) 88vw, 50vw"
          />
        ) : (
          <span className="font-serif text-8xl text-[#889475]" aria-hidden="true">{p.title.slice(0, 1)}</span>
        )}
      </div>
      <div className="max-w-xl self-center">
        <p className="mb-5 text-[10px] font-bold tracking-[0.2em]">
          {p.categories.map((c) => c.name).join(" / ") || "THE COLLECTION"}
        </p>
        <h1 className="mb-5 font-serif text-5xl leading-none tracking-[-0.045em] md:text-6xl">{p.title}</h1>
        <p className="mb-6 whitespace-pre-line leading-7 text-muted-foreground">{p.description}</p>
        <form className="grid gap-6" action={addItem}>
          <Hidden name="locale" value={locale} />
          <fieldset className="grid gap-3 rounded-xl border bg-card p-4">
            <legend className="px-2 text-sm font-medium">Variant</legend>
            {p.variants.map((v) => (
              <Label key={v.id} className="flex items-start gap-3 font-normal">
                <Input className="mt-0.5 size-4 shrink-0"
                  type="radio"
                  name="variantId"
                  value={v.id}
                  disabled={!v.isAvailable}
                  required
                  defaultChecked={
                    v.id ===
                    p.variants.find((variant) => variant.isAvailable)?.id
                  }
                />
                <span>
                  {v.title}
                  {v.localizedAttributes.length > 0
                    ? ` (${v.localizedAttributes.map((a) => `${a.name}: ${a.label}`).join(" / ")})`
                    : ""}{" "}
                  — {money(v.priceCents, store?.currency, store?.precision)}
                  {!v.isAvailable ? " · " + t("unavailable") : ""}
                </span>
              </Label>
            ))}
          </fieldset>
          <div className="grid max-w-32 gap-2">
            <Label>
              {t("quantity")}
              <Input
                type="number"
                name="quantity"
                min="1"
                max="999"
                defaultValue="1"
                required
              />
            </Label>
          </div>
          <Button className="w-full sm:w-auto" size="lg" type="submit" disabled={!p.variants.some((v) => v.isAvailable)}>
            {p.variants.some((v) => v.isAvailable)
              ? t("add")
              : t("unavailable")}{" "}
            <span aria-hidden="true">↗</span>
          </Button>
        </form>
        <aside className="mt-8 border-t pt-5 text-sm leading-6 text-muted-foreground" aria-label="Fulfillment information">
          Shipping and local pickup options are confirmed at checkout.
        </aside>
      </div>
    </section>
  );
}

export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

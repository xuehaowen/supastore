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
    <section className="grid gap-12 py-8 md:grid-cols-[1.1fr_1fr]">
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-[#e5e8df]">
        {p.images[0] ? (
          <img className="size-full object-cover"
            src={"/api/assets?key=" + encodeURIComponent(p.images[0].s3Key)}
            alt={p.images[0].altText || p.title}
            width="800"
            height="800"
          />
        ) : (
          <span className="font-serif text-8xl text-[#889475]" aria-hidden="true">{p.title.slice(0, 1)}</span>
        )}
      </div>
      <div>
        <p className="mb-6 text-[10px] font-bold tracking-[0.2em]">
          {p.categories.map((c) => c.name).join(" / ") || "THE COLLECTION"}
        </p>
        <h1 className="mb-7 font-serif text-5xl tracking-[-0.045em]">{p.title}</h1>
        <p className="mb-6 whitespace-pre-line leading-7 text-muted-foreground">{p.description}</p>
        <form className="grid gap-5" action={addItem}>
          <Hidden name="locale" value={locale} />
          <fieldset className="grid gap-3 rounded-lg border p-4">
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
          <Button type="submit" disabled={!p.variants.some((v) => v.isAvailable)}>
            {p.variants.some((v) => v.isAvailable)
              ? t("add")
              : t("unavailable")}{" "}
            ↗
          </Button>
        </form>
        <p className="mt-5 text-sm text-muted-foreground">Shipping and local pickup options at checkout.</p>
      </div>
    </section>
  );
}

export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

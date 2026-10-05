import { notFound } from "next/navigation";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
const titles = {
  about: ["About us", "关于我们"],
  shipping: ["Shipping & pickup", "配送与自提"],
  returns: ["Returns policy", "退货政策"],
  privacy: ["Privacy policy", "隐私政策"],
};
export default async function StorePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!(slug in titles)) notFound();
  const key = slug as keyof typeof titles;
  const [store] = await db.select().from(storeSettings).limit(1);
  const content =
    store?.publicContent[locale as "en" | "zh"]?.[key] ||
    store?.publicContent[store.defaultLocale as "en" | "zh"]?.[key];
  if (!content) notFound();
  return (
    <article className="mx-auto max-w-3xl py-14">
      <h1 className="mb-8 font-serif text-4xl">
        {titles[key][locale === "zh" ? 1 : 0]}
      </h1>
      <p className="whitespace-pre-line leading-8">{content}</p>
    </article>
  );
}

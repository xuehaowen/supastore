import { textFor } from "@/i18n/messages";
import { notFound } from "next/navigation";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
const titles = {
  about: "about",
  shipping: "shippingPolicy",
  returns: "returnsPolicy",
  privacy: "privacyPolicy",
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
        {
          textFor(locale).common[
            titles[key] as
              "about" | "shippingPolicy" | "returnsPolicy" | "privacyPolicy"
          ]
        }
      </h1>
      <p className="whitespace-pre-line leading-8">{content}</p>
    </article>
  );
}

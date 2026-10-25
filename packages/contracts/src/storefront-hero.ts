import * as v from "valibot";

const localizedHero = v.object({
  heading: v.pipe(v.string(), v.trim(), v.maxLength(120)),
  body: v.pipe(v.string(), v.trim(), v.maxLength(300)),
  imageAlt: v.pipe(v.string(), v.trim(), v.maxLength(180)),
});
const featuredIds = (max: number) =>
  v.pipe(
    v.array(v.pipe(v.string(), v.uuid())),
    v.maxLength(max),
    v.check(
      (ids) => new Set(ids).size === ids.length,
      "Choose each item once.",
    ),
  );
export const storefrontHeroSchema = v.nullable(
  v.object({
    imageKey: v.nullable(
      v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
    ),
    imagePosition: v.exactOptional(v.picklist(["top", "center", "bottom"])),
    featuredCollectionIds: v.exactOptional(featuredIds(3)),
    featuredProductIds: v.exactOptional(featuredIds(6)),
    en: v.exactOptional(localizedHero),
    zh: v.exactOptional(localizedHero),
  }),
);
export type StorefrontHero = v.InferOutput<typeof storefrontHeroSchema>;

export function localizedStorefrontHero(
  hero: StorefrontHero | undefined,
  locale: string,
  defaultLocale = "en",
) {
  if (!hero) return null;
  const requested = hero[locale === "zh" ? "zh" : "en"];
  const fallback =
    hero[defaultLocale === "zh" ? "zh" : "en"] ?? hero.en ?? hero.zh;
  return {
    imageKey: hero.imageKey,
    heading:
      requested?.heading ||
      fallback?.heading ||
      hero.en?.heading ||
      hero.zh?.heading ||
      "",
    body:
      requested?.body || fallback?.body || hero.en?.body || hero.zh?.body || "",
    imageAlt:
      requested?.imageAlt ||
      fallback?.imageAlt ||
      hero.en?.imageAlt ||
      hero.zh?.imageAlt ||
      "",
  };
}

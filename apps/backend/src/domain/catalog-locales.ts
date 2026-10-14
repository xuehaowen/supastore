export const CATALOG_LOCALES = ["en", "zh"] as const;
export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

export function translationLocales(defaultLocale: string): CatalogLocale[] {
  const normalized: CatalogLocale = defaultLocale === "zh" ? "zh" : "en";
  return CATALOG_LOCALES.filter((locale) => locale !== normalized);
}

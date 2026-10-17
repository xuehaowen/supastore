export function publicOrigin() {
  const url = new URL(
    process.env.STOREFRONT_ORIGIN ||
      process.env.APP_URL ||
      "http://localhost:3001",
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Invalid public storefront origin");
  return url.origin;
}
export function alternateLinks(
  path: string,
  locales: readonly ("en" | "zh")[] = ["en", "zh"],
) {
  const origin = publicOrigin();
  if (!locales.length) throw new Error("Missing public locales");
  return {
    ...Object.fromEntries(
      locales.map((locale) => [locale, `${origin}/${locale}${path}`]),
    ),
    "x-default": `${origin}/${locales.includes("en") ? "en" : locales[0]}${path}`,
  };
}
export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

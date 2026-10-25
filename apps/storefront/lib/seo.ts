import { resolvePublicOrigin } from "../../../packages/config/public-origin.mjs";
export function publicOrigin() {
  return resolvePublicOrigin(process.env);
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

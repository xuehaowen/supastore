export function publicOrigin() {
  const url = new URL(
    process.env.STOREFRONT_ORIGIN ||
      process.env.APP_URL ||
      "http://localhost:3001",
  );
  return url.origin;
}
export function alternateLinks(path: string) {
  const origin = publicOrigin();
  return {
    en: `${origin}/en${path}`,
    zh: `${origin}/zh${path}`,
    "x-default": `${origin}/en${path}`,
  };
}
export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

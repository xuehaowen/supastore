/** Resolve the browser-facing origin consistently across both services. */
/** @param {Record<string, string | undefined>} env */
export function resolvePublicOrigin(env) {
  const configured =
    env.STOREFRONT_ORIGIN || env.APP_URL || env.BETTER_AUTH_URL;
  if (!configured && env.NODE_ENV === "production")
    throw new Error("A public storefront origin is required in production.");
  const url = new URL(
    configured || `http://localhost:${env.STOREFRONT_PORT || "3001"}`,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Invalid public storefront origin.");
  return url.origin;
}

/** @param {Record<string, string | undefined>} env */
export function resolveBackendOrigin(env) {
  const url = new URL(env.BACKEND_URL || "http://127.0.0.1:3000");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("BACKEND_URL must be an HTTP origin");
  return url.origin;
}

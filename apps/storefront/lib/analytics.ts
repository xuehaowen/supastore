export function analyticsPayload(path: string) {
  return /^\/(en|zh)(?:\/products\/[^/]+)?$/.test(path)
    ? { event: "page_view", path }
    : null;
}
export function analyticsEndpoint() {
  const value = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function sendAnalytics(payload: Record<string, string | number>) {
  const endpoint = analyticsEndpoint();
  if (endpoint)
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      body: JSON.stringify(payload),
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
}

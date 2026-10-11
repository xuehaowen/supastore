import { alternateLinks, publicOrigin } from "./seo";

export function xml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}
export function sitemapCount(total: number, pageSize: number) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    pageSize !== 1000 ||
    total > 50000000
  )
    throw new Error("Invalid sitemap pagination.");
  return Math.max(1, Math.ceil(total / pageSize));
}
export function* sitemapIndex(pages: number) {
  yield '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  for (let page = 1; page <= pages; page++)
    yield `<sitemap><loc>${xml(`${publicOrigin()}/sitemaps/${page}.xml`)}</loc></sitemap>`;
  yield "</sitemapindex>";
}
export function* sitemapEntries(handles: string[], includeHome: boolean) {
  yield '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">';
  const paths = [
    ...(includeHome ? [""] : []),
    ...handles.map((handle) => `/products/${encodeURIComponent(handle)}`),
  ];
  for (const path of paths)
    for (const locale of ["en", "zh"]) {
      const alternates = Object.entries(alternateLinks(path))
        .map(
          ([language, url]) =>
            `<xhtml:link rel="alternate" hreflang="${language}" href="${xml(url)}"/>`,
        )
        .join("");
      yield `<url><loc>${xml(`${publicOrigin()}/${locale}${path}`)}</loc>${alternates}</url>`;
    }
  yield "</urlset>";
}
export function sitemapResponse(chunks: Iterable<string>) {
  const iterator = chunks[Symbol.iterator]();
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      pull(controller) {
        const chunk = iterator.next();
        if (chunk.done) controller.close();
        else controller.enqueue(encoder.encode(chunk.value));
      },
      cancel() {
        iterator.return?.();
      },
    }),
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=30",
      },
    },
  );
}

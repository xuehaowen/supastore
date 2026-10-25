import { resolvePublicOrigin } from "../../../../../packages/config/public-origin.mjs";
import {
  sitemapResources,
  sitemapPageCount,
  type SitemapCounts,
  type SitemapEntry,
} from "@/application/common/sitemap";
export {
  sitemapPageCount,
  type SitemapResource,
} from "@/application/common/sitemap";
const origin = () => resolvePublicOrigin(process.env).replace(/\/$/, "");
const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
export function* sitemapIndex(counts: SitemapCounts) {
  sitemapPageCount(counts);
  yield '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  yield `<sitemap><loc>${xml(`${origin()}/sitemaps/static.xml`)}</loc></sitemap>`;
  for (const resource of sitemapResources)
    for (let page = 1; page <= Math.ceil(counts[resource] / 1000); page++)
      yield `<sitemap><loc>${xml(`${origin()}/sitemaps/${resource}-${page}.xml`)}</loc></sitemap>`;
  yield "</sitemapindex>";
}
export function* sitemapEntries(entries: SitemapEntry[]) {
  yield '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  for (const entry of entries)
    for (const locale of entry.locales ?? ["en", "zh"])
      yield `<url><loc>${xml(`${origin()}/${locale}${entry.path}`)}</loc>${entry.updatedAt ? `<lastmod>${entry.updatedAt.toISOString()}</lastmod>` : ""}</url>`;
  yield "</urlset>";
}
export function sitemapResponse(chunks: Iterable<string>) {
  const iterator = chunks[Symbol.iterator]();
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        try {
          const next = iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(encoder.encode(next.value));
        } catch (error) {
          iterator.return?.();
          controller.error(error);
        }
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

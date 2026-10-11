import {
  getCombinedSitemapPage,
  getCombinedSitemapStatic,
} from "@/application/queries/combined-sitemap";
import {
  sitemapEntries,
  sitemapResponse,
  type SitemapResource,
} from "@/infrastructure/http/sitemap";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ page: string }> },
) {
  const { page } = await context.params;
  if (page === "static.xml")
    return sitemapResponse(sitemapEntries(await getCombinedSitemapStatic()));
  const match = /^(products|collections|categories)-([1-9]\d{0,4})\.xml$/.exec(
    page,
  );
  if (!match || Number(match[2]) > 49999)
    return new Response("Not found", { status: 404 });
  return sitemapResponse(
    sitemapEntries(
      await getCombinedSitemapPage(
        match[1] as SitemapResource,
        Number(match[2]),
      ),
    ),
  );
}

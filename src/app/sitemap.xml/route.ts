import { getCombinedSitemapIndex } from "@/application/queries/combined-sitemap";
import { sitemapIndex, sitemapResponse } from "@/infrastructure/http/sitemap";
export const dynamic = "force-dynamic";
export async function GET() {
  const counts = await getCombinedSitemapIndex();
  return sitemapResponse(sitemapIndex(counts));
}

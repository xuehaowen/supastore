import { parseSitemapPageDto } from "@supastore/contracts";
import { readPublicApi } from "../../lib/api";
import { sitemapCount, sitemapIndex, sitemapResponse } from "../../lib/sitemap";
export const dynamic = "force-dynamic";
export async function GET() {
  const data = await readPublicApi("sitemap?index=1", parseSitemapPageDto);
  return sitemapResponse(sitemapIndex(sitemapCount(data.total, data.pageSize)));
}

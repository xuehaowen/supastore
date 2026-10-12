import { parseSitemapPageDto } from "@supastore/contracts";
import { readPublicApi } from "../../../lib/api";
import {
  sitemapCount,
  sitemapEntries,
  sitemapResponse,
} from "../../../lib/sitemap";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ page: string }> },
) {
  const match = /^([1-9]\d{0,4})\.xml$/.exec((await params).page);
  const page = match ? Number(match[1]) : 0;
  if (!page || page > 50000) return new Response(null, { status: 404 });
  const data = await readPublicApi(`sitemap?page=${page}`, parseSitemapPageDto);
  if (page > sitemapCount(data.total, data.pageSize))
    return new Response(null, { status: 404 });
  return sitemapResponse(
    sitemapEntries(
      data.items.map((item) => item.handle),
      page === 1,
    ),
  );
}

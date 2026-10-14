import {
  getCombinedSitemapIndex,
  getCombinedSitemapPage,
  getCombinedSitemapStatic,
} from "@/application/queries/combined-sitemap";
import { sitemapResources } from "@/application/common/sitemap";
import { DomainError } from "@/application/common/errors";
import { apiInteger, apiResponse } from "@/infrastructure/http/commerce-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return apiResponse(async () => {
    const query = new URL(request.url).searchParams;
    if (query.get("index") === "1") return getCombinedSitemapIndex();
    const resource = query.get("resource");
    if (resource === "static") return getCombinedSitemapStatic();
    const selected = sitemapResources.find((value) => value === resource);
    if (!selected) throw new DomainError("Invalid sitemap resource.");
    const page = apiInteger(
      { page: Number(query.get("page") || 1) },
      "page",
      1,
      49999,
    );
    return getCombinedSitemapPage(selected, page);
  }, true);
}

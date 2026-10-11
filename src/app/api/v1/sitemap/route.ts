import { getSitemapPage } from "@/application/queries/sitemap";
import { apiResponse, apiInteger } from "@/infrastructure/http/commerce-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return apiResponse(async () => {
    const params = new URL(request.url).searchParams;
    return getSitemapPage(
      apiInteger({ page: Number(params.get("page") || 1) }, "page", 1, 50000),
      params.get("index") === "1",
    );
  }, true);
}

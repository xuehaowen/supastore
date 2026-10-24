import type { CatalogDto } from "@supastore/contracts";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import {
  apiResponse,
  apiInteger,
  apiText,
} from "@/infrastructure/http/commerce-api";
import { localeOf } from "@/infrastructure/web";
export async function GET(request: Request) {
  return apiResponse<CatalogDto>(async () => {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return listProducts({
      locale: localeOf(query.locale),
      search: apiText(query, "search", 200, true),
      categorySlug: apiText(query, "category", 120, true),
      collectionHandle: apiText(query, "collection", 120, true),
      page: apiInteger(
        { page: query.page ? Number(query.page) : 1 },
        "page",
        1,
        10000,
      ),
      pageSize: apiInteger(
        { size: query.pageSize ? Number(query.pageSize) : 24 },
        "size",
        1,
        100,
      ),
      ...(query.sort === "recommended" ||
      query.sort === "newest" ||
      query.sort === "price-low" ||
      query.sort === "price-high"
        ? { sort: query.sort }
        : {}),
    });
  }, true);
}

import type { ProductDto } from "@supastore/contracts";
import { getProduct } from "@/application/use-cases/catalog/get-product";
import { apiResponse, apiText } from "@/infrastructure/http/commerce-api";
import { localeOf } from "@/infrastructure/web";
export async function GET(
  request: Request,
  context: { params: Promise<{ handle: string }> },
) {
  return apiResponse<ProductDto>(
    async () =>
      getProduct({
        handle: apiText(await context.params, "handle", 120),
        locale: localeOf(new URL(request.url).searchParams.get("locale")),
      }),
    true,
  );
}

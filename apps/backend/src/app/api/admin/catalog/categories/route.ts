import { searchCategoryOptions } from "@/application/queries/category-options";
import { staffIdentity } from "@/infrastructure/web";
import { apiResponse } from "@/infrastructure/http/commerce-api";
export async function GET(request: Request) {
  return apiResponse(() =>
    staffIdentity().then((id) =>
      searchCategoryOptions(
        id,
        new URL(request.url).searchParams.get("q") || "",
      ),
    ),
  );
}

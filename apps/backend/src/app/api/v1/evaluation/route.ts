import { parseCommercePreviewRequest } from "@supastore/contracts";
import { previewCommerce } from "@/application/use-cases/commerce/preview-commerce";
import { apiResponse, readApiBody } from "@/infrastructure/http/commerce-api";
export async function POST(request: Request) {
  return apiResponse(async () =>
    previewCommerce(parseCommercePreviewRequest(await readApiBody(request))),
  );
}

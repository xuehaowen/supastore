import { searchVariantOptions } from "@/application/queries/variant-options";
import { staffIdentity } from "@/infrastructure/web";
import { apiResponse } from "@/infrastructure/http/commerce-api";
import { DomainError } from "@/domain/errors";

export async function GET(request: Request) {
  return apiResponse(async () => {
    const params = new URL(request.url).searchParams;
    const scope = params.get("scope") || "sale";
    if (scope !== "sale" && scope !== "quota")
      throw new DomainError("Invalid variant scope.");
    return searchVariantOptions(
      await staffIdentity(),
      params.get("q") || "",
      scope,
    );
  });
}

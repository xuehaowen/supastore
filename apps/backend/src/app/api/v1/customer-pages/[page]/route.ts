import {
  accountPage,
  cartPage,
  catalogPage,
  checkoutPage,
  collectionPage,
  layoutPage,
  orderPage,
  productPage,
} from "@/infrastructure/http/customer-page-data";
import { apiResponse, apiText } from "@/infrastructure/http/commerce-api";
import { NotFoundError } from "@/application/common/errors";
import { localeOf } from "@/infrastructure/web";

export async function GET(
  request: Request,
  context: { params: Promise<{ page: string }> },
) {
  return apiResponse(async () => {
    const { page } = await context.params;
    const search = new URL(request.url).searchParams;
    const query = Object.fromEntries(search);
    for (const [key, value] of Object.entries(query))
      apiText({ [key]: value }, key, key === "q" ? 200 : 120, true);
    const locale = localeOf(query.locale);
    const options = search.getAll("options").slice(0, 4);
    switch (page) {
      case "layout":
        return layoutPage();
      case "catalog":
        return catalogPage(locale, { ...query, options });
      case "product":
        return productPage(locale, apiText(query, "handle", 120));
      case "cart":
        return cartPage(locale);
      case "checkout":
        return checkoutPage(locale, query);
      case "account":
        return accountPage(query);
      case "order":
        return orderPage(apiText(query, "id", 36));
      case "collection":
        return collectionPage(locale, apiText(query, "handle", 120), query);
      default:
        throw new NotFoundError("Customer page not found.");
    }
  });
}

import { MAX_ITEM_QUANTITY } from "@supastore/contracts";
import type { CartDto } from "@supastore/contracts";
import {
  apiResponse,
  readApiBody,
  apiText,
  apiInteger,
} from "@/infrastructure/http/commerce-api";
import { guestIdentity, localeOf } from "@/infrastructure/web";
import { getCart } from "@/application/use-cases/cart/get-cart";
import { addToCart } from "@/application/use-cases/cart/add-to-cart";
import { updateCartItem } from "@/application/use-cases/cart/update-cart-item";
import { parseActionUuid } from "@/application/common/request-validation";
async function cart(locale: string): Promise<CartDto | null> {
  const identity = await guestIdentity();
  const result = identity
    ? await getCart({ guestSessionId: identity, locale })
    : null;
  if (!result) return null;
  return {
    id: result.id,
    revision: result.revision,
    items: result.items,
    subtotalCents: result.subtotalCents,
    itemCount: result.itemCount,
  };
}
export async function GET(request: Request) {
  return apiResponse(() =>
    cart(localeOf(new URL(request.url).searchParams.get("locale"))),
  );
}
export async function POST(request: Request) {
  return apiResponse(async () => {
    const body = await readApiBody(request);
    const locale = localeOf(body.locale);
    await addToCart({
      guestSessionId: await guestIdentity(true),
      locale,
      variantId: parseActionUuid(apiText(body, "variantId"), "Variant"),
      quantity: apiInteger(
        body,
        "quantity",
        1,
        MAX_ITEM_QUANTITY,
        undefined,
        "Quantity",
      ),
    });
    return cart(locale);
  });
}
export async function PATCH(request: Request) {
  return apiResponse(async () => {
    const body = await readApiBody(request);
    const locale = localeOf(body.locale);
    await updateCartItem({
      guestSessionId: await guestIdentity(),
      locale,
      itemId: parseActionUuid(apiText(body, "itemId"), "Item"),
      quantity: apiInteger(
        body,
        "quantity",
        0,
        MAX_ITEM_QUANTITY,
        undefined,
        "Quantity",
      ),
    });
    return cart(locale);
  });
}

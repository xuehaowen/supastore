import { mutateCart } from "./mutate-cart";
export function addToCart(input: {
  guestSessionId: string;
  variantId: string;
  quantity?: number;
  locale?: string;
}) {
  return mutateCart({ ...input, quantity: input.quantity ?? 1 }, "add");
}

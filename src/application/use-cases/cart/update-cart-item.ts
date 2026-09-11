import { mutateCart } from "./mutate-cart";
export function updateCartItem(input: {
  guestSessionId: string;
  itemId: string;
  quantity: number;
  locale?: string;
}) {
  return mutateCart(input, "set");
}

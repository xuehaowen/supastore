import { mutateCart } from './mutate-cart';
export function removeCartItem(input: { guestSessionId: string; itemId: string; locale?: string }) {
  return mutateCart({ ...input, quantity: 0 }, 'set');
}


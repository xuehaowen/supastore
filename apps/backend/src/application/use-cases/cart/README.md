# Cart workflows

Read and mutate an owned cart before checkout.

## When working here

Check session ownership and cart revision. Cart changes must invalidate stale quotes without rewriting an accepted order.

## Where to start

- [add-to-cart.ts](add-to-cart.ts): Adds an eligible variant to the owned cart.
- [get-cart.ts](get-cart.ts): Reads cart identity and current contents.
- [mutate-cart.ts](mutate-cart.ts): Coordinates authorized cart mutations and revisions.
- [update-cart-item.ts](update-cart-item.ts): Changes an owned cart item quantity; zero removes the item.

## More context

Cart storage is defined in `src/infrastructure/db/schema/carts.ts`; HTTP entry points use `/api/v1/cart`. Placement converts each source cart at most once. `tests/unit/checkout.test.ts` and `tests/integration/lightweight-commerce.test.ts` cover the surrounding checkout workflow.

[Parent overview](../README.md)

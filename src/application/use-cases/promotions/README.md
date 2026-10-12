# Promotion management

Merchant discount/promotion configuration used by authoritative checkout pricing.

## When working here

Coordinate settings and placement so accepted quotes cannot silently use changed promotion terms.

## Where to start

- [manage-promotions.ts](manage-promotions.ts): Creates and edits merchant promotions.

## More context

Discount storage lives in `src/infrastructure/db/schema/promotions.ts`; pure calculations are in `src/domain/promotions.ts`. Check `tests/unit/promotions.test.ts` when changing policy or pricing.

[Parent overview](../README.md)

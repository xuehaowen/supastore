# Catalog management

Product and variant editing, options, specifications, collections, translations, media, imports and exports.

## When working here

Preserve referenced variant identity and purchase history. Catalog images use validated storage workflows; orders keep accepted snapshots.

## Where to start

- [manage-catalog.ts](manage-catalog.ts): Core merchant catalog management.
- [generate-variants.ts](generate-variants.ts): Option combinations and stable variant generation.
- [list-products.ts](list-products.ts): Public catalog listing.
- [update-product.ts](update-product.ts): Product editing workflow.
- [import-products-csv.ts](import-products-csv.ts): Validated product import.

## Related paths and checks

- Storage: `catalog.ts`, `catalog-media.ts`, `catalog-translations.ts` and `collections.ts` in the database schema directory.
- Checks: unit `variant-combinations.test.ts`, integration `catalog-translations.test.ts`, and browser `catalog-management.spec.ts` / `catalog-polish.spec.ts`.
- Merchant UI: products, attributes, categories, collections and translations. Public reads use `list-products.ts` / `get-product.ts`; merchant reads use `list-admin-products.ts`.

## More context

[Parent overview](../README.md)

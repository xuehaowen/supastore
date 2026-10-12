# Root app localization

Root locale dictionaries, request context and customer copy/helpers.

## When working here

Update English and Chinese together and verify placeholders. Shared packages and the separate storefront also have localization responsibilities.

## Where to start

- [customer.ts](customer.ts): Customer locale helpers and localized error messages.
- [messages.ts](messages.ts): Root translation dictionary access.
- [request.ts](request.ts): Next-intl request locale configuration.

## More context

Root messages merge local dictionaries with `packages/i18n`; the separate storefront has its own locale helpers/copy. Update both English and Chinese and check `tests/unit/i18n-coverage.test.ts` plus browser `i18n.spec.ts` / `cross-service-i18n.spec.ts`. See [storefront localization](../../docs/storefront-i18n.md) for the shared contract.

[Parent overview](../README.md)

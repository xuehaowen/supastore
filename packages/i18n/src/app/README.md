# Application localization

English and Chinese dictionaries, request context and customer copy shared by both applications.

## When working here

Update English and Chinese together and verify placeholders. Pure customer helpers live one directory above this application request configuration.

## Where to start

- [customer.ts](customer.ts): Customer locale helpers and localized error messages.
- [messages.ts](messages.ts): Shared application translation dictionary access.
- [request.ts](request.ts): Next-intl request locale configuration.

## More context

Application messages merge these dictionaries with the pure customer dictionaries. Check `tests/unit/i18n-coverage.test.ts` and the browser localization suites. See [storefront localization](../../../../docs/storefront-i18n.md) for the shared contract.

[Parent overview](../../README.md)

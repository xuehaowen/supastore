# HTTP contracts

This package contains serializable customer/store/catalog/cart DTOs only. Both
applications resolve `@supastore/contracts` through TypeScript paths. Use
`import type`; there are no runtime exports, database types or dependencies.

The account route checks its response with `satisfies CustomerAccountDto` and
serializes dates as ISO strings. Storefront consumers use the same type. Add
new fields here when expanding the HTTP contract, then validate and authorize
inputs in the backend application layer.

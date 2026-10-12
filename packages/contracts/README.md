# HTTP contracts

This package contains serializable customer/store/catalog/cart and checkout DTOs,
plus dependency-free response validators. Both applications resolve
`@supastore/contracts` through TypeScript paths. Use `import type` for DTOs;
import the matching runtime decoder for store, catalog, product, cart, account,
order, checkout, upload, payment, and recovery responses.
There are no database types, server configuration, or external dependencies.

Backend mappers are constrained by shared DTO types and serialize dates as ISO
strings. Storefront consumers use the same contracts. Add
new fields here when expanding the HTTP contract, then validate and authorize
inputs in the backend application layer. Quote and order responses serialize dates
before crossing HTTP. Server reads require a decoder; browser requests return
unknown data unless a decoder is supplied. Invalid JSON, missing envelopes, and
malformed consumed fields fail through the HTTP error boundary before rendering
or navigation.

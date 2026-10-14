# HTTP contracts

This package contains serializable customer/store/catalog/cart and checkout DTOs,
plus dependency-free response validators. Both applications resolve
`@supastore/contracts` as a workspace package. Use `import type` for DTOs;
import the matching runtime decoder for store, catalog, product, cart, account,
order, checkout, upload, payment, and recovery responses.
There are no database types, server configuration, or external dependencies.

`CustomerPageModels`, `QuoteTerms` and `ProductDetail` explicitly describe the
original customer UI's public responses. Backend loaders are checked against
these contracts during compilation, so the storefront never imports backend
types. Sitemap helpers are exported from `@supastore/contracts/sitemap`.

Backend mappers are constrained by shared DTO types and serialize dates as ISO
strings. Storefront consumers use the same contracts. Add
new fields here when expanding the HTTP contract, then validate and authorize
inputs in the backend application layer. Quote and order responses serialize dates
before crossing HTTP. Server reads require a decoder; browser requests return
unknown data unless a decoder is supplied. Invalid JSON, missing envelopes, and
malformed consumed fields fail through the HTTP error boundary before rendering
or navigation.

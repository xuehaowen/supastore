# HTTP contracts

This package contains serializable customer/store/catalog/cart and checkout DTOs,
plus pure response validators. Customer-page schemas use Valibot; both applications resolve
`@supastore/contracts` as a workspace package. Use `import type` for DTOs;
import the matching runtime decoder for store, catalog, product, cart, account,
order, checkout, upload, payment, and recovery responses.
There are no database types or server configuration. Valibot is declared as a runtime dependency; existing lightweight endpoint validators remain unchanged.

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

## Customer-page decoding and compatibility

`parseCustomerPage(page, value)` from `@supastore/contracts/customer-page-validation` validates all eight customer-page responses,
including nested consumed records, safe integer amounts, supported statuses and
wire timestamps. Signed credit entries are valid. Opaque persisted quote item and
shipping snapshots are structurally bounded to their array/object shape; they
are not rendered directly. Validation errors contain no payload details; the
storefront's existing HTTP boundary converts them to a safe 502 with request ID.

The schemas have a dedicated subpath so existing client imports from the package
root do not initialize the page-schema graph. Only the server page-data reader
uses this decoder in the storefront runtime; measure compiled client chunks when
changing exports or validation dependencies.

Public store data may be absent before bootstrap. Saved checkout quotes, initial
values, translations and online-payment attempts are omitted when unavailable;
the TypeScript models now reflect the actual serialized wire shape.

Additional unknown fields are discarded, preserving additive backend changes.
Removing/renaming required fields or adding an unsupported status is a breaking
change: deploy compatible producers first, then consumers, retaining the previous
fields for rollback. Do not roll back a producer to an incompatible response while
new consumers are active. TypeScript checks constrain schema outputs against the
public models and backend loaders against those same models; browser acceptance
must also decode actual serialized backend responses. Frozen synthetic fixtures
in `tests/fixtures/customer-pages.ts` retain the supported response examples.

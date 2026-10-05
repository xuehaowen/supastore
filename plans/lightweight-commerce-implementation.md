# Lightweight commerce implementation plan

Date: 2026-09-15  
Baseline: `e8a7733`  
Status: proposed implementation plan; no application features are implemented by this document.

## 1. Decision and scope

Build on SupaStore's existing Next.js + PostgreSQL application. Adopt the useful commerce concepts and merchant workflows demonstrated by Medusa, while keeping SupaStore's deployment and transaction model.

The user selected: **a single-store shop with stock tracking, customer accounts, store credit, and manual payments; hosted card payments are an optional subsequent phase.**

“Complete” means a merchant can configure the shop, maintain a catalog, receive and reconcile payment, fulfill orders, receive physical returns, issue appropriate refunds, and operate backups without editing database rows. A customer can discover products, select a valid variant, check out as a guest or signed-in customer, use credit, track an order, and request a return. Each included feature must work across admin, storefront, persistence, authorization, and failure recovery.

### Included in the core release

- One merchant, one settlement currency with configured precision, English/Chinese catalog content.
- Product/category/collection management; reusable options and descriptive attributes; variant/SKU generation; media upload; drafts and publication.
- Search, filters, sorting, paginated browsing, product details, cart and final checkout review.
- Optional stock tracking per variant, with one stock pool and transactional reservations.
- Guest checkout plus verified customer identity, order ownership, addresses, and customer account pages.
- Manual transfer/cash payments, credit-only checkout, or store credit plus one external payment method.
- Promotions already supported by SupaStore, with understandable percentage/currency inputs.
- Shipment/pickup, order notifications, physical returns, refunds, customer credit history, audit records.
- Store configuration, public policy/contact pages, basic SEO, monitoring, import/export, backup/restore verification.

### Optional follow-on

One hosted card provider, provider reconciliation and webhooks. It reuses the same order, funding, inventory, and refund contracts. Installing/configuring this integration must not be necessary for a manual-payment store.

### Explicitly outside this plan

Multi-tenant SaaS, marketplaces, multi-currency price books, multiple warehouses, inventory kits, subscriptions, gift-card sales, loyalty points/tiers, arbitrary promotion builders, automatic tax services, shipping-label procurement, a theme marketplace, visual page builder, external search service, and a generic plugin/workflow platform. Exchanges use a return plus a new order initially. Orders ship as a whole initially; partial physical returns remain supported.

These boundaries preserve complete basic commerce without claiming Medusa feature parity.

## 2. Medusa comparison: what to adopt and simplify

Use current Medusa v2 documentation, with source-level notes in [the research companion](medusa-capability-research.md). Old Medusa v1 examples and older Cloud-only descriptions of store credit are not the baseline.

| Area                   | Medusa reference behavior                                                                                                                                                                                                                                 | SupaStore implementation decision                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog lists          | Searchable/filterable product lists and focused management flows. [Product guide](https://docs.medusajs.com/user-guide/products)                                                                                                                          | Use one consistent list/detail/edit pattern, existing table components, URL-based query state, and server-side pagination.                                                                  |
| Categories             | Hierarchical product organization with dedicated management. [Category guide](https://docs.medusajs.com/user-guide/products/categories)                                                                                                                   | A table that preserves hierarchy, plus a small edit dialog. Search results show the full parent path. Avoid one permanently expanded form per category.                                     |
| Collections            | Dedicated collection list/details, product selection, unique handles; a product belongs to one collection in Medusa's documented model. [Collection guide](https://docs.medusajs.com/user-guide/products/collections)                                     | Deliberately allow many-to-many membership: the same item can appear in Summer and Gifts. Use a small join table, manual membership, and explicit ordering. No rule evaluator.              |
| Options and variants   | Reusable global options are now documented; variant selection is built from product options. [Options guide](https://docs.medusajs.com/user-guide/products/options)                                                                                       | Reuse SupaStore's attribute/value tables as the global dictionary, add product-specific option selection, and generate combinations in an editable preview.                                 |
| Descriptive attributes | Do not assume arbitrary product specifications are identical to Medusa option axes; distinguish native options from metadata/custom extensions.                                                                                                           | Separate “Options that create variants” from “Specifications” in the editor, even when both reuse the same controlled dictionary. Material can be a specification without multiplying SKUs. |
| Store credit           | Medusa's optional open-source Loyalty Plugin supplies customer credit accounts and checkout support, rather than requiring custom implementation from scratch. [Release announcement](https://medusajs.com/blog/announcing-the-loyalty-plugin-for-medusa) | Implement a narrow customer credit ledger in the existing app. Include balance/history, issuance, redemption and refund settlement; omit gift-card products and reward programs.            |
| Stock                  | Inventory items, levels, reservations and stock locations support broader warehouse scenarios. [Inventory module](https://docs.medusajs.com/resources/commerce-modules/inventory)                                                                         | One tracked stock row per variant, adjustment history and order reservations. No stock-location abstraction until an actual second warehouse is needed.                                     |
| Returns                | Medusa models returns and receiving quantities, including damaged/restockable items. [Returns guide](https://docs.medusajs.com/user-guide/orders/returns)                                                                                                 | Adopt physical return receipt and disposition. Keep manual money settlement explicit; recording returned goods must not falsely report a bank refund as sent.                               |
| Runtime                | Medusa documents separate storefront deployment and production server/worker deployment with PostgreSQL and Redis. [Deployment guide](https://docs.medusajs.com/learn/deployment)                                                                         | Keep one Next.js application, one PostgreSQL database, existing object storage/SMTP, and the existing PostgreSQL outbox. Add no Medusa runtime dependency.                                  |

SKU generation is a SupaStore design choice in this plan. Generating option combinations does not by itself establish that Medusa generates merchant-friendly, unique SKUs; see the companion's precise source findings.

## 3. Current-code assessment

| Existing foundation                                                                               | Gap to close                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product table; category editing; variant add/edit/remove use cases                                | Category and variant forms are fragmented; product list loads the catalog without admin search/pagination; images require storage keys.                                                            |
| `attributes`, `attribute_values`, translations and `variant_attribute_values`                     | New variants currently write free-text JSON color/size. Structured associations and JSON can disagree; no option-library admin.                                                                    |
| Product `isPublished`, `quoteVersion`, unique handles/SKUs                                        | Draft creation is not a complete editor flow. Existing products require variants; zero-variant drafts need explicit handling in both creation and listing queries.                                 |
| Product/category/variant translations                                                             | No collection translation model or attribute translation UI.                                                                                                                                       |
| Guest carts, immutable quotes, order access links, receipt reconciliation and refund/payout logic | No stock reservations, credit funding, or physical returns model.                                                                                                                                  |
| Better Auth users/sessions and customer sign-up/account UI                                        | Customer account page is a signed-in shell; orders are guest-contact based, with no stable customer owner relation. Reuse the authentication foundation rather than starting a second auth system. |
| Customer table groups orders by email                                                             | No customer detail/history ownership, address book, balance or customer-specific account ledger.                                                                                                   |
| Flat shipping, pickup, tax and promotion code calculation                                         | Complete the UX and validation; add no separate pricing engine.                                                                                                                                    |
| PostgreSQL search, outbox, existing tests                                                         | Need representative production measurements and new cross-feature concurrency tests.                                                                                                               |

Relevant entry points:

- `src/app/admin/{products,categories,customers,translations}` and `src/app/admin/operations.tsx`.
- `src/app/interactive.tsx`, `src/app/actions.ts`, `src/app/client-requests.ts`.
- `src/application/use-cases/catalog/{create-product,update-product,manage-catalog,localize,list-products,import-products-csv}.ts`.
- `src/application/use-cases/{get-quote,create-order,create-manual-order,confirm-order,fulfill-order,refund-payout}.ts` and `orders/cancel-order.ts`.
- `src/infrastructure/db/schema/{catalog,catalog-translations,orders,payments,refunds-payouts,auth}.ts`.
- `src/domain/financial-projection/` and `src/domain/locking/lock-order.ts`.

**Documentation drift is real:** README says customer registration is absent, while the current UI and auth handler expose account functionality. Promotions and multiple pickup locations also exceed older scope wording. Reconcile docs against runnable code in Phase 0. Do not use old scope exclusions to block the user's newly requested features.

Existing type checking and seven admin browser tests passed during the preceding UI work. That is limited evidence, not proof of whole-store production readiness. The browser runner reported Windows cleanup access errors. `scripts/benchmark-memory.ts` measures a synthetic allocation script, not the running Next.js server, database workload, or full deployment; it cannot substantiate the README memory claims.

## 4. Information architecture and shared interaction rules

### Admin navigation

```text
Overview
Catalog
  Products
  Categories
  Collections
  Attributes & options
  Import & export
Inventory
Orders
Payments
Fulfillment & returns
Customers
Store credit
Promotions
Translations
Settings
Activity
```

Keep existing URLs working. Add explicit navigation matching so category/collection/attribute pages keep Catalog active. Store credit gets its own discoverable link and appears in customer details. Hide unconfigured optional capabilities with explanatory setup links in Settings; never ship a clickable dead-end section.

### Shared list behavior

- Table with page title/count, primary create action, search, applicable filters, sort, empty state, and pagination.
- Server queries default to 25 rows and cap at 100. Selected rows are current-page IDs; selection clears when filters change. A future “all matching” action must state its scope explicitly.
- Row actions open small dialogs or detail routes. Destructive actions explain affected records and preserve required reason/audit fields.
- Category columns: name/path, handle, direct product count, visibility, actions. Parent/depth remains visible on search results; search uses flat results rather than hiding a matching child under a collapsed ancestor.
- Variant columns: options, SKU, price, availability, tracked stock where enabled, actions. Batch price and availability updates include a review summary and revision check.
- Preserve query state and scroll position on back navigation. Keep errors adjacent to fields, retain failed input, show pending/success status, and prevent duplicate submission.
- Use currency/percentage inputs, parsing decimal strings into integer minor units/basis points. Do not use binary floating-point arithmetic for stored money.
- Use semantic tables and current primitives before adding a grid dependency. Mobile tables scroll within their container; item names and actions remain easy to locate. Full product edits use a page; short category/attribute edits use dialogs.
- Keyboard navigation, labeled selection controls, focus restoration, visible errors, accessible dialogs, and screen-reader checks are part of each feature's acceptance.

### Product editor

Sections: Details, Media, Organization, Specifications, Options & variants, Publishing. Keep one clear unsaved-changes indicator and Save draft/Publish actions. Editing options stages a preview; do not immediately mutate saved variants while a merchant is experimenting.

Example:

```text
Product: Everyday Shirt    SKU prefix: SHIRT
Color: Red, Blue
Size: S, M, L
Preview: 6 combinations; 4 new, 2 existing

Include | Color | Size | SKU          | Price | Available
yes     | Red   | S    | SHIRT-RED-S  | 19.99 | yes
yes     | Red   | M    | SHIRT-RED-M  | 19.99 | yes
...
```

## 5. Catalog data and migration design

### Reuse first

Retain products, categories, product_categories, product_variants, product_images and existing translation tables. Retain the boolean publication model for this release; add an archive marker only where destructive deletion would lose history. Avoid introducing product lifecycle states that have no user action.

### Proposed additions

| Model/change                               | Purpose and key constraints                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product_collections`                      | Unique handle, title, description, optional image, published flag, revision and timestamps.                                                                                                                   |
| `product_collection_memberships`           | Unique `(collection_id, product_id)`, explicit sort order; removing membership does not delete a product.                                                                                                     |
| `collection_translations`                  | Unique `(collection_id, locale)`, title/description with existing fallback behavior.                                                                                                                          |
| Existing `attributes` / `attribute_values` | Stable codes, human labels, display order, archive state; controlled values and translations.                                                                                                                 |
| Category visibility and revision           | Add published/hidden behavior and optimistic revision to the existing category model; define ancestor visibility and member-product behavior explicitly. Preserve current visible categories during backfill. |
| `product_options`                          | Unique `(product_id, attribute_id)`, display order; selects variant-generating axes.                                                                                                                          |
| `product_option_values`                    | Values allowed for a product's option, with ownership foreign keys; a value must belong to that option's attribute.                                                                                           |
| `product_specification_values`             | Product-level descriptive values. Do not generate variants from these. Start with controlled text labels rather than arbitrary typed custom-field schemas.                                                    |
| Existing `variant_attribute_values`        | Canonical option assignments; enforce one allowed value for each product option. Verify variant, product, option and value ownership in the use case and composite constraints where practical.               |
| Variant `combination_key`                  | Canonical sorted attribute/value IDs; unique per product for fully mapped variants. Legacy unmapped variants remain explicitly unmapped until reconciled.                                                     |
| Product `sku_prefix`                       | Persisted merchant-editable prefix used only for new suggestions; label/handle edits never silently rename existing SKUs.                                                                                     |
| Optional variant image relation            | Link a variant to an existing image of the same product; no duplicate binary upload. Storefront option changes use the selected variant image with product-image fallback.                                    |
| Catalog upload intents                     | Reuse storage adapter and upload-validation patterns with a public-catalog scope distinct from private payment evidence.                                                                                      |

### Variant-generation contract

1. Normalize and deduplicate chosen value IDs; compute the combination count before allocating the Cartesian product.
2. Preserve the current 50-variant cap initially. Count existing retained variants as well as proposed new ones. Show which combinations exceed the cap and allow exclusions; reassess only after measured need.
3. Produce names from option labels and SKU suggestions from a persisted prefix and stable value codes. No random regeneration on re-render.
4. Preview identifies existing/new/changed combinations. Existing IDs, SKUs, pricing, translations, and stock remain unchanged unless explicitly edited.
5. Merchant edits are retained. Resolve suggested SKU collisions with a visible deterministic suffix; validate uniqueness across the entire store, case-normalized according to a documented rule. A collision discovered on save returns a recoverable conflict, not an unannounced rename.
6. Serialize generation on the product row; verify product revision; enforce DB uniqueness; commit product, options, variants, associations, audit and cache invalidation intent together.
7. Add new combinations by default. Removing an option/value never silently deletes ordered variants. Show impact; archive/disallow future purchase or reject the change until the merchant maps retained variants. Never rewrite historical orders.
8. Manual one-variant products remain supported. A no-option draft can have zero variants; publication requires at least one valid purchasable variant. Product listing must use a left join/aggregate that retains empty drafts.
9. Admin creation, manual additions, imports, and future API callers invoke the same catalog mutation path. This eliminates separate JSON-only writes.

### Existing-data transition

- Run a read-only inventory of raw JSON keys/values, normalized links, duplicate combinations, case-colliding SKUs, and products exceeding new assumptions.
- Preserve legacy IDs, SKUs, translations and raw JSON during the transition. Generate a mapping report; do not guess equivalence between `navy`, `blue`, and `蓝色` or translate codes automatically.
- Backfill only unambiguous links in bounded resumable batches. Conflicts stay visible as “Needs option mapping” and block generation for that product, not existing purchasing.
- Migrate writes to one canonical normalized path. Temporarily derive legacy JSON for read compatibility in the same transaction; remove fallback readers only after import, storefront and admin all use the normalized representation and reconciliation is clean.
- Preserve all quote/purchase snapshots. New order items explicitly snapshot names/SKUs/options; recover old values from immutable quote snapshots where available, not mutable catalog rows. Ambiguous historical data remains labeled rather than fabricated.
- Existing publication remains unchanged. Adding drafts must not unpublish real products.

## 6. Identity, stock, credit and return contracts

These are implementation requirements to elaborate in the existing authoritative workflow/transaction documents before their migrations land.

### Customer ownership

- Reuse Better Auth. Add a `customers` business profile with an optional unique auth-user relation, plus customer addresses and nullable `orders.customer_id`. Guests remain valid customers of the storefront without compulsory registration.
- New signed-in orders attach the server-verified customer ID; posted email/customer IDs never grant ownership. Historical guest orders remain unlinked until the holder of the scoped order-access proof explicitly claims them while signed in. No automatic linking by matching email.
- Email changes do not transfer an account's orders or credit to another user. Keep balances attached to stable customer IDs. Do not automatically merge profiles.
- Credit accounts require a verified customer owner before redemption. Staff can locate/create a business profile, but cannot bypass account verification to spend customer credit through a manual order in the first slice.
- Account pages: profile, addresses, order history/detail, credit balance/history, returns, recovery and sign-out. Admin customer details link to those business records with appropriate staff permissions.

### Single-pool stock

- Add `variant_stock` (unique variant, tracking flag, on-hand/reserved quantities), immutable `stock_movements`, and `stock_reservations` linked to order items. Availability remains a separate merchandising switch.
- Existing variants start with tracking disabled; no inferred initial quantities. Owner enables tracking and records an opening balance with a reason.
- Reject disabling stock tracking while active reservations exist. Re-enabling tracking reconciles the existing movement history and records an explicit count adjustment; it must not apply a second opening balance or erase earlier commitments.
- Available to sell = on-hand minus active reservations. No backorders in the core release. All changes use sorted variant locks and audited integer adjustments.
- Cart/quote are advisory and do not reserve stock. At order creation, recheck current purchasability and stock; reserve all requested tracked quantities atomically or reject the whole order with cart retained.
- Retain reservations while manual payment is pending. An overdue review deadline creates an operational queue; elapsed time alone does not prove no bank transfer occurred. Owner cancellation explicitly releases stock and resolves any actual collected funds.
- Confirmation retains reservations. Shipment/pickup handoff consumes them once and decreases on-hand once. Cancellation releases only unconsumed reservations. Returned goods increment stock only when received and marked restockable.
- A downward count correction that would take on-hand below reserved stock must be surfaced as a shortage workflow; block affected fulfillment and resolve/reallocate/cancel orders explicitly. Do not silently make stock negative or release paid reservations.
- Late payment after cancellation retains current financial return semantics and never reopens stock commitments automatically.

### Store-credit accounting

Add `store_credit_accounts` (unique customer/currency, materialized posted/reserved totals and revision), append-only `store_credit_entries`, and `store_credit_reservations`. Entries include signed amount, reason, actor, idempotency key, order/refund reference and reversal link. DB-backed current totals and ledger insertion update together under the account lock; a reconciliation job verifies totals against history.

Credit is **funding**, not a promotion or a fictitious bank receipt. `confirmation_funding` currently requires a real receipt ID. Extend that funding snapshot to support a typed source (external receipt or credit debit) with exactly-one-source constraints, preserving all existing receipt links. Credit refund settlements need their own typed settlement reference; do not insert fake transfers or weaken existing payout allocation checks.

Rules:

- Owner can issue credit with reason and reviewed amount; staff can view operational status but cannot issue, reverse or refund credit. Mutations recheck membership inside the transaction.
- No arbitrary “edit balance” field. Corrections append a compensating entry, and cannot reduce available funds below zero or spend reserved funds. Erroneous already-spent issuance becomes an owner investigation, not a silent negative customer balance.
- Core credit has no expiration, transfer, cash-out, purchasable top-up, or gift-card code. Those need separate rules and are outside scope.
- Lock store currency/precision after the first monetary credit entry as well as the first order. Concurrent currency changes and first issuance must share the store gate; never reinterpret an existing balance under a new precision.
- Available credit = posted balance minus active reservations. Pending commitments are visible separately in admin/customer history.
- Checkout shows merchandise, promotion, tax/shipping, credit applied, and remaining external amount. Credit does not reduce the purchase/tax base. Revalidate the requested credit against the authenticated account and quote at order creation.
- Reserve credit atomically with order creation and stock. Capture it once at confirmation; a fully credit-funded/free order can confirm atomically without a fabricated receipt. A mixed manual order remains unpaid until the remaining real payment is sufficient and confirmed.
- Failed placement rolls back all holds; cancelling an unconfirmed order releases its credit reservation. Successful capture replaces the reservation with a debit in one transaction. Do not restore a captured debit merely because a browser retry or notification failed.
- Freeze the original source allocation at confirmation. For partial refunds, allocate each refunded purchased component across its original funding sources using deterministic integer rounding and cumulative per-source caps; a repeated refund cannot choose a new allocation to exceed a cap.
- Default refund destination: consumed credit returns to credit; externally funded value follows existing original-source payout rules. An owner can offer externally funded purchase refunds as credit only through a separately confirmed customer-agreed destination. Reserve the same refund entitlement once, settle it to credit once, and prevent the same amount from later becoming a cash payout. Excess/late unrelated transfers keep original-source return rules.
- A correction to external funding after credit has been issued or spent creates an explicit reconciliation/merchant-loss case; do not confiscate redeemed credit, invent another receipt, or automatically recharge the customer.

Example: a 100.00 order uses 30.00 credit and 70.00 transfer. Confirmation freezes those sources. A 50.00 proportional purchase refund returns 15.00 credit and authorizes 35.00 original-source payout. Remaining source entitlements become 15.00 and 35.00. Tests must also cover non-divisible minor units and successive partial refunds.

### Locking and idempotency

- Extend `lock-order.ts` to cover product/stock and credit owners. Write one lock-order specification used by placement, confirmation, cancellation, returns, refunds and stock adjustments.
- Candidate order preserving existing financial sequencing: store gate when required → cart → orders → catalog products/stock rows → credit accounts → case/upload records → payment accounts/receipts → refund allocations/payout attempts. Sort IDs within each rank. Validate the actual call graph; no nested helper may acquire an earlier rank after a later one.
- Code issuing only stock adjustments or credit can start at that owner's rank but cannot then reach backwards to orders. Multi-order operations determine and lock all order IDs first.
- Use unique request keys with request-payload hashes. Reuse with different input returns a conflict; retry with the same input recovers the committed result.
- No provider, email, or object-storage network request inside financial/stock transactions. Write outbox records with business changes. Add race tests before enabling mixed funding.

### Physical returns

Add `order_returns` and `order_return_items` with requested/approved/received/rejected/cancelled transitions, quantities, reasons and disposition. A customer can request return of owned, fulfilled quantities; staff records receipt and restockable/damaged quantities; owner authorizes resulting refund. Reserve return quantities under the order lock: requested plus approved outstanding quantities and already received quantities cannot exceed fulfilled quantities. Rejection/cancellation releases outstanding quantities; receiving rechecks the remaining allocation and prevents repeated restocking.

Goods receipt and financial settlement are separate visible statuses. They share references and entitlements but have independent recovery. A damaged item may still be refundable; inventory disposition is not itself a refund decision. Use the current refund/payout workflow and the new credit settlement source. Avoid a second monetary calculation hidden in a return form.

## 7. Implementation sequence and acceptance gates

Sizing is relative: S = localized work, M = a feature across layers, L = a cross-module change requiring migration and concurrency tests. Sequence is dependency-based, not a delivery-date promise. Each phase produces usable end-to-end behavior and updated contracts; unfinished feature flags remain off.

### Phase 0 — Baseline and contracts (M)

- Reconcile README, scope, architecture, workflows, database schema, transaction contracts and roadmap against current source and tests. Record implemented/partial/planned accurately.
- Run existing unit/integration/browser suites and production build; isolate known failures. Fix test-runner process ownership/Windows cleanup in a separate infrastructure change.
- Measure the actual standalone app, not development mode or a synthetic allocation loop; record baseline fixture, environment and budgets.
- Decide exact customer-claim, stock-hold and credit-refund rules above in authoritative docs, with worked examples and lock acquisition graph.
- Deliver migration inventory and a mapping report for legacy options. No feature migration before the report is reviewed.
- Gate: baseline evidence exists, old financial tests pass or known blockers are recorded, and proposed money/ownership changes have executable acceptance examples.

### Phase 1 — Catalog/admin consistency (M)

- Add shared list toolbar, server paging/filter parsing, row selection, empty/error states and focused row actions using existing UI primitives.
- Products: thumbnail, title, publication, variant count, price range, categories; search by title/handle/SKU; status/category filtering; stable sorting/pagination; include zero-variant drafts.
- Categories: table with parent path/count and create/edit dialogs; move/reorder with cycle prevention; preview products/children affected by removal. No orphaning or accidental subtree deletion.
- Product detail: variant table with unified edit/availability/removal controls; bulk pricing/availability; move add/remove away from permanently displayed forms.
- Add decimal currency and percentage controls and update promotions; preserve server-side money validation and conflict handling.
- Gate: manage 100 categories and a 50-variant product on desktop/mobile without full-page form sprawl; failed/stale edits preserve input; list back-navigation retains filters; existing order history unchanged.

### Phase 2 — Reusable options and safe variant generation (L)

- Build `/admin/attributes` and detail routes; values, ordering, archive, usage counts, EN/ZH translation. Separate variant axes from product specifications.
- Add product option/value and specification associations; backfill and resolve legacy mapping; make create/edit/import share canonical writes.
- Add generation preview, stable SKU suggestions, combination validation, exclusions, bulk price defaults, duplicate detection, and revision-safe save.
- Storefront product option selectors resolve one valid available variant, update price/image/stock, and disable impossible combinations. Retain variant IDs in cart/order requests.
- Gate: 2 colors × 3 sizes gives exactly 6 variants; retry and concurrent save create no duplicates; changing a display label preserves SKU/history; adding a new size adds only missing combinations; deleting an in-use value is actionable and safe; non-Latin labels work.

### Phase 3 — Collections, product media and publishing (M)

- Build collection list/detail/product picker, manual ordering, image and translations; product editor can add/remove multiple memberships.
- Add `/[locale]/collections/[handle]` and category routes, paginated collection/category browsing, explicit visibility and storefront navigation. Hidden parents/collections must not expose hidden content through direct routes or cached lists.
- Replace image-key UI with validated upload/finalization, preview, alt text and reordering; use existing S3 adapter. Failed/unclaimed uploads expire through existing worker patterns. A client-provided key alone does not authorize attaching an arbitrary object.
- Full product creation page supports incomplete drafts and a publication checklist; handle suggestions remain editable. Handle changes create controlled redirects or an explicit URL-impact warning before save.
- Gate: merchant creates a product without storage/database access, publishes it into two collections, sees correct localized public pages, and unpublishes it without stale purchasable cache entries.

### Phase 4 — Customer accounts and ownership (L)

- Verify existing registration/verification/reset behavior and complete it with generic recovery responses, throttling and clear delivery failures.
- Add stable customer profiles, address book, owned-order relation, explicit guest-order claim, admin customer search/detail and account order history.
- Checkout prefills a selected address but stores immutable fulfillment/contact snapshots. Guest checkout remains the default available path.
- Gate: registration and verified sign-in work end to end; guessed email/order ID cannot claim an order; another customer cannot read history; email changes keep ownership; customer sign-up never creates staff membership.

### Phase 5 — Inventory and dependable order detail (L)

- Add stock rows/movements/reservations, owner stock adjustments and low-stock filter; product/variant editors expose tracking and available quantity.
- Integrate reservations into guest/manual order placement, confirmation, cancellation, shipment and pickup. Add overdue manual-payment review and explicit release actions.
- Introduce `/admin/orders/[id]` with items, customer, payment sources, stock, fulfillment and chronological activity; preserve current query/dialog links through redirects/links.
- Keep billing, payment review, stock shortage, fulfillment and lifecycle labels distinct. Blocking conditions explain how staff can resolve them.
- Gate: two simultaneous customers buying the last unit yield one accepted order; double shipment/cancellation cannot move stock twice; stock corrections below reservations open a visible shortage; late payment cannot reacquire released stock silently.

### Phase 6 — Store credit end to end (L; depends on 4 and funding contracts from 0)

- Build `/admin/store-credit` account list: customer, available, reserved, currency, last activity. Detail page: immutable ledger, issue credit, reverse eligible entry, linked orders/refunds, export.
- Customer account shows balance/history; checkout lets the owner apply available credit and clearly shows external remainder. No credit controls for unverified guests.
- Implement credit reserve/capture/release, typed funding snapshots, partial/source-aware refunds, optional customer-agreed credit refund destination, and ledger reconciliation.
- Extend manual-payment instructions, confirmation, notices, receipt corrections and cancellation to use remaining external due rather than total purchase price. Revenue remains merchandise revenue; credit issuance is not a sale and redemption is not a discount.
- Gate: credit-only and mixed orders work; concurrent spending cannot overdraw; replayed requests cannot issue/refund twice; cancelled unpaid orders release holds; partial refunds preserve source caps; staff cannot issue credit; historical cash-only orders remain valid.

### Phase 7 — Returns and storefront completion (L)

- Customer return request, admin approval/receipt/disposition, partial return quantities, restock and linked refund status. Cancellation before fulfillment remains separate.
- Complete public category/collection/search filters and sort, product availability feedback, cart preservation across sign-in, checkout validation/review, tracking, pickup instructions and order recovery.
- Facet queries must match all selected option values on the same purchasable variant, not different variants of one product. Search includes localized titles with documented EN/ZH fallback; verify matching/index behavior against Chinese fixtures rather than assuming English full-text stemming supports Chinese.
- Add policy/contact/about content through a few Settings fields, not a CMS. Add metadata, canonical URLs, sitemap, robots rules, product structured data, localized navigation and meaningful 404s. Exclude admin/account/order-token URLs from indexing.
- Audit promotions, shipping/tax display, fees, address requirements, timezones, email events and tracking messages against the new credit/stock behavior.
- Extend CSV preview/import/export for option codes, values, collection membership and availability. Keep legacy CSV templates compatible; reject ambiguous mapping. Use bounded batches and explicit resumability rather than one long transaction for an entire file.
- Gate: a merchant performs create → purchase → payment → shipment → partial return → correct restock/refund entirely through the UI, with customer-visible status and no database edits.

### Phase 8 — Production release evidence (M)

- Run the full acceptance matrix below and fix blockers. Test cold restore with outbound delivery disabled, duplicate outbox replay and failed-email recovery.
- Exercise inventory/credit reconciliation, existing financial corrections and unusual mixed-funding cases. Report unmatched reservations and ledger drift visibly; do not auto-correct money.
- Measure performance with representative data; examine query plans; apply indexes only to demonstrated access paths. Verify no unbounded variant/customer/ledger loads.
- Update installation, migration, operating procedures and truthful footprint claims; package a repeatable release checklist. Release features only when their full journeys pass.

### Phase 9 — Optional hosted card payments (L; after core stabilization)

- Choose one provider based on merchant country/currency and requirements at implementation time. Do not add an unused provider SDK to the core public bundle.
- Add payment attempts and deduplicated provider event storage plus a narrow adapter: initiate hosted checkout, retrieve state, request refund. Use durable attempt IDs and signed webhook verification.
- Persist attempt before provider call; call outside the DB transaction; reconcile by webhook/retrieval. A browser success redirect never proves payment. Amount/currency/order ownership must match immutable expected terms.
- Handle timeout/unknown outcome, duplicate and out-of-order events, expiry/cancellation races, partial refunds, chargebacks and stale sessions. An expired browser session cannot release stock/credit until provider uncertainty is resolved; late captured payment goes to explicit reconciliation.
- Reuse typed funding and refund caps. Core manual receipt recording continues to work without provider credentials.
- Gate: provider sandbox end-to-end tests and interrupted-flow recovery pass; optional adapter disabled leaves core deployment functional.

## 8. Route/module ownership for implementation

Names below are proposed additions, not claims that these files already exist.

| Responsibility                             | Primary location                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| List primitives and form feedback          | `src/components/admin/`; existing `src/components/ui/` and `src/app/admin/admin.css`                                      |
| Catalog pages and query state              | `src/app/admin/products/`, `categories/`, new `collections/`, `attributes/`                                               |
| Catalog business changes                   | `src/application/use-cases/catalog/`; new focused `options`, `collections`, `media` use cases as needed                   |
| Combination keys/SKU suggestion/validation | `src/domain/catalog/` with pure functions                                                                                 |
| Customer ownership                         | new `src/application/use-cases/customers/`, `src/infrastructure/db/schema/customers.ts`, existing auth boundary           |
| Inventory                                  | new `src/application/use-cases/inventory/`, `src/domain/inventory/`, `src/infrastructure/db/schema/inventory.ts`          |
| Store credit                               | new `src/application/use-cases/store-credit/`, `src/domain/store-credit/`, `src/infrastructure/db/schema/store-credit.ts` |
| Funding and source-aware refund projection | existing financial projection, confirmation, cancellation, correction and payout modules; no parallel financial engine    |
| Returns                                    | new `src/application/use-cases/returns/` and `src/infrastructure/db/schema/returns.ts`                                    |
| Optional provider adapter                  | `src/infrastructure/payments/`, dedicated webhook route and typed attempt model                                           |
| Storefront                                 | existing locale routes plus collection/category/account/return detail routes                                              |
| Verification                               | `tests/unit`, `tests/integration`, `tests/browser`, existing synthetic fixtures and runner                                |

Split the large `actions.ts` and `operations.tsx` only along touched responsibilities. Keep existing exports/URLs compatible while callers migrate. Avoid a repository-wide refactor as a prerequisite to shipping tables.

## 9. Lightweight architecture and budgets

### Fixed architectural constraints

- One application codebase and default Node process. PostgreSQL owns durable business state, locks, idempotency and background jobs.
- Keep Drizzle, Valibot, Better Auth, current UI components, PostgreSQL full-text/trigram search, S3-compatible storage and SMTP.
- No Redis, Kafka, Elasticsearch, Medusa modules, global workflow engine, GraphQL gateway, separate admin SPA or mandatory CMS.
- Use server-rendered storefront pages with small client islands. Keep variant editor, bulk table code and spreadsheet libraries out of customer-route bundles. Load heavy import/export code only on demand.
- Bounded input/page/batch sizes; selected fields; indexes for collection membership, attribute associations, stock lookup, customer/order ownership, ledger history and request keys. Derived totals may be cached but the underlying ledger/reservation truth stays transactional.
- Outbox worker uses bounded batches and existing leases. Optional worker-only deployment uses the same application artifact only when load warrants it.

### Measurement contract

All values here are proposed acceptance targets, not measured guarantees. Phase 0 records actual baseline and revises any unrealistic number explicitly.

| Dimension         | Target and method                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App memory        | Aim for ≤512 MiB steady-state standalone app RSS under a 30-minute representative load; report startup/peak separately. PostgreSQL and OS are measured separately, not hidden inside the app claim.                                        |
| Reference dataset | 10,000 products, 50,000 variants, 100,000 orders; realistic category/collection distributions and ledger history. Also test one 50-variant product and empty stores.                                                                       |
| Reference load    | Record CPU/RAM/Postgres/storage/network configuration; 10 concurrent browsing users and 2 concurrent checkout/administrative writers as an initial small-shop envelope. Add targeted hot-stock/hot-credit races separately.                |
| Server latency    | Initial targets: p95 public catalog reads <300 ms and local order mutations <800 ms, excluding client network and external provider calls; record cold/warm results and query counts.                                                      |
| Browser bundles   | Measure route-level compressed JS baseline; aim for ≤10 KiB added storefront JS for catalog option/collection UI and no admin-only imports. The old “50 KiB including framework” claim is unverified and must not be repeated as achieved. |
| Media             | Responsive images with explicit dimensions, lazy loading offscreen assets, bounded uploads; thumbnail rendering must not download original-size media.                                                                                     |
| Container         | Record compressed/uncompressed production image size, build time and layers; aim for ≤10% growth over measured Phase 0 baseline for core dependencies. Do not promise an unverified <80 MB image.                                          |
| Access patterns   | Lists never fetch all products/variants/credit entries; page cap 100; ledger uses indexed stable cursor pagination; export streams/chunks data.                                                                                            |
| Reliability       | No negative available stock/credit, no duplicate issue/capture/refund, no silent unresolved money state. These are release blockers even when latency meets target.                                                                        |

Track infrastructure count and merchant setup steps alongside memory. A feature that requires an additional always-on service or database console work has failed the lightweight design objective unless explicitly justified.

## 10. Acceptance matrix

| Journey                        | Required evidence                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Product draft → publication    | Zero-variant draft stays editable/listed; invalid publication blocked with field errors; valid product appears publicly.                    |
| Categories                     | Parent move/reorder, cycle rejection, counts, safe removal and public visibility verified.                                                  |
| Collections                    | Multi-membership, sort, translation, hidden collection direct URL, product unpublish and cache invalidation tested.                         |
| Option generation              | 2×3 generation, maximum cap, duplicate/collision, retries, archive rules, stale save and translated label changes tested.                   |
| Media                          | Unauthorized object key, wrong MIME/size, failed upload, orphan cleanup, preview/order and public/private isolation tested.                 |
| Admin usability                | Search/paging/back-state, empty/error/loading states, keyboard dialog/table use and long forms at 375/768/1440px checked.                   |
| Customer identity              | Sign-up/verification/reset, customer/staff separation, owned history, explicit guest claim and email-change isolation tested.               |
| Last stock unit                | Concurrent order submissions yield one reservation; losing checkout retains cart and gets an actionable error.                              |
| Manual-payment delay           | Overdue hold remains visible; cancellation releases stock/credit only through explicit resolution; late transfer creates proper obligation. |
| Shipment/pickup                | Repeated handoff/ship calls cannot consume stock twice; no automatic delivery based on tracking number.                                     |
| Credit issuance                | Owner-only, auditable, duplicate request safe; error retains form; ledger and account totals reconcile.                                     |
| Credit redemption              | Credit-only, mixed and insufficient-credit checkout; two concurrent spenders cannot overdraw.                                               |
| Credit cancellation            | Uncaptured reservation releases once; captured credit refund posts once; notification failure changes neither.                              |
| Mixed-source refund            | Multiple partial refunds and rounding cannot exceed original source or purchased component caps.                                            |
| Credit refund destination      | Customer-agreed external-to-credit settlement cannot also be paid externally; corrections after spending stay investigable.                 |
| Physical returns               | Owned fulfilled quantity limits, partial receipt, damaged/restockable split, no duplicate stock increment, refund-status visibility.        |
| Catalog changes after purchase | Historical SKU/name/options/prices remain stable after label changes, SKU edits and variant archive.                                        |
| Import/export                  | Old template compatibility, new normalized mappings, malformed CSV, resumable retries and partial batch failure reported.                   |
| Operational recovery           | Restart during commit/delivery, cold backup restore, locked owner recovery, disabled outbound recovery and reconciliation reports.          |
| Optional hosted cards          | Duplicate/out-of-order webhook, cancelled/expired session, unknown capture, source-aware refund and provider-disabled core run.             |

Unit tests cover combination/decimal/funding calculations. PostgreSQL integration tests cover locks, constraints, migration and idempotency. Browser tests cover user-visible outcomes. Screenshot/axe checks supplement, rather than replace, keyboard and screen-reader checks. Preserve existing financial regression tests; update expectations only when the approved contract intentionally changes.

## 11. Rollout and rollback

1. Expand schema with nullable/backward-compatible columns and new tables; keep new features disabled.
2. Take a verified backup; run read-only mapping diagnostics; backfill in resumable batches with counts/checksums and unresolved-row reports.
3. Deploy compatible readers and one canonical write path. Exercise a synthetic shop before enabling on real catalog data.
4. Enable catalog capabilities first. Enable tracked inventory per variant only after an explicit opening balance. Enable credit only after identity, funding, refund and reconciliation tests pass together.
5. Retain old snapshots and legacy option data until the new reader path and exports have been verified for a complete release window. Remove obsolete compatibility code in a separate migration.
6. After real stock/credit activity, rollback must not delete ledgers or revert to code that ignores obligations. Disable new sales/issuance if necessary, keep tracking/refund/reconciliation available, and deploy a compatible fix or restore through a reconciled recovery procedure.

## 12. Recommended starting batch

Begin with Phase 0 and Phase 1: establish a truthful baseline, deliver category/variant tables and product filtering, and define the option-mapping contract. Then implement Phase 2 as the first catalog feature with new data relationships. Collections/media can follow independently of customer identity; credit cannot ship independently of customer ownership and funding/refund correctness.

No production deployment, provider selection, purchased service, schema migration or application implementation is performed by this planning task.

# Medusa comparison research

Research date: 2026-09-15. Primary sources only; current Medusa v2 documentation. This is a capability and workflow comparison, not a recommendation to replace Supastore with Medusa. Recommendations below are design proposals, not statements of existing Supastore behavior.

## Version-sensitive corrections

- Global reusable product options are native since v2.16.0. Older descriptions of Medusa options as exclusively product-specific are obsolete. [Option management](https://docs.medusajs.com/user-guide/products/options)
- Store credit is an official optional open-source Loyalty Plugin, compatible with v2.14.0+, rather than a custom recipe or current Cloud-only feature. The April 28, 2026 announcement explicitly records the change from Cloud-only availability. [Module installation](https://docs.medusajs.com/resources/commerce-modules/store-credit), [release announcement](https://medusajs.com/blog/announcing-the-loyalty-plugin-for-medusa)
- Some generated API source comments still claim Cloud-only availability. Prefer the current installation guide and dated release announcement for availability; verify exact installed version before copying implementation details.

## Five requested areas

### 1. Category and variant tables

**Medusa:** Categories have a searchable/filterable list, nested hierarchy, sibling ranking, unique handles, description, active/inactive status, and public/private visibility. Product membership is many-to-many. Category details manage products; a separate ranking editor rearranges hierarchy. [Category guide](https://docs.medusajs.com/user-guide/products/categories)

**Supastore proposal:** Use a tree table with title, parent/path, product count, visibility, and row actions. A side editor handles metadata; a searchable product picker handles membership. Preserve expanded rows and list filters after edits. Provide keyboard-accessible move-up/down and parent selection before investing in drag-and-drop. Enforce no cycles, no self-parenting, stable handles, and explicit child handling before deletion.

**Medusa:** Variants appear within product details, with search/filter and a separate detail page. Missing option combinations can be created individually. Bulk editors manage prices and stock. Variant-specific images come from the product media library. SKU is an editable optional field. [Variant guide](https://docs.medusajs.com/user-guide/products/variants)

**Supastore proposal:** Start with an embedded table: selection, option labels, SKU, price, stock or availability, status, and actions. Use a drawer for individual edits and a scoped bulk editor for selected rows. A global SKU inventory list is useful later, but does not replace the product-level editing context.

### 2. Collections

**Medusa:** Collections group related products by a merchandising theme. A product belongs to a single collection. The list supports search/filter; title and unique handle identify a collection. Collection details support adding and removing products, metadata, and translations. [Collection guide](https://docs.medusajs.com/user-guide/products/collections)

**Supastore proposal:** Intentionally allow many collections per product through a small membership table, so one product can appear in Summer, Gifts, and New arrivals. Add manual product order, image, description, draft/published status, and collection storefront route. These are deliberate Supastore requirements, not claimed default Medusa collection features. Defer rule-based collections: scheduled dynamic membership and condition builders create disproportionate complexity for a small store.

### 3. Attributes and options

**Medusa:** Options are reusable choices such as Color or Size. The global options page lists reusable options by default and can include product-specific options. Editors manage title, values, and value order. Unused options can be deleted. Product creation can reuse selected global values or create a product-specific option. [Option guide](https://docs.medusajs.com/user-guide/products/options)

**Distinction:** A variant-driving option differs from a descriptive attribute such as care instructions, country of manufacture, or fabric composition. Medusa has fixed product/variant fields and metadata, and supports custom data-model extensions. The researched guides do not establish a general native typed attribute-schema manager comparable to a PIM. Property Labels changes admin column names; it does not define product attributes. [Product extension](https://docs.medusajs.com/resources/commerce-modules/product/extend), [Property Labels](https://docs.medusajs.com/user-guide/settings/property-labels)

**Supastore proposal:** Make the existing attribute dictionary the canonical source. Distinguish selectable variant options from descriptive specifications in both schema and UI. Start specifications with controlled values from that dictionary; add typed text, number, boolean or other extensions later only when actual catalog needs justify them. Avoid a generic schema builder. Use immutable IDs, stable machine codes, display labels/translations, value order, optional swatch, and usage counts. Renaming a label must not change SKU or variant identity. Prevent deletion of referenced values; archive them or explicitly migrate usage.

### 4. Variant and SKU generation

**Medusa:** The creation wizard has Details, Organize, and Variants stages, plus an optional inventory-kit stage. Adding options automatically produces combinations; merchants can uncheck unwanted variants and reorder them. The resulting bulk editor allows title, SKU, inventory settings, and prices to be edited. The guide establishes automatic combination generation, but does not establish a native automatic SKU naming policy. [Create product](https://docs.medusajs.com/user-guide/products/create)

**Supastore proposal:** Compute the Cartesian product of selected option values, show its count before generation, and display a preview. Generate only missing combinations, keep existing variant IDs unchanged, and report excluded/duplicate combinations. Suggest deterministic SKUs from a stable product code plus option-value codes; allow overrides and require globally unique SKUs with actionable database collision errors. Requiring SKUs is an intentional difference from Medusa's documented optional editable field. Never silently regenerate existing SKUs after a title change. Use a canonical sorted option-ID/value-ID combination key and unique product+combination constraint. Keep the current bounded variant limit initially and explain it before submission. Write all approved rows in one transaction; retries must not create duplicates.

Storefront selectors must resolve the complete choice to one actual variant and add that variant to cart. [Medusa storefront variant selection](https://docs.medusajs.com/resources/storefront-development/products/variants)

### 5. Store credit

**Medusa:** The optional Loyalty Plugin adds customer/currency accounts and credit/debit transactions. Balances are calculated from transactions. Cart credit lines reduce the remaining payable amount; checkout validates and reserves credit before converting it to a debit on order completion. Transactions reference originating entities. [Store credit concepts](https://docs.medusajs.com/resources/commerce-modules/store-credit/concepts)

**Medusa admin:** The account table shows customer, currency, balance, total credits/debits, and creation date, with customer/date filters. Details show transaction history and manual credit actions. Customer details link accounts. Refunds may go to store credit for registered customers. [Manage store credit](https://docs.medusajs.com/user-guide/loyalty/store-credits/manage)

**Supastore proposal:** Build customer identity and authenticated ownership first. Start with one account per customer/currency, an append-only ledger in integer minor units, and server-side credit/refund commands. Require reasons and retain actor/source/idempotency keys. Available balance equals posted credits minus posted debits minus active reservations. Lock the account during concurrent reserve/spend operations; reject overspending. Support manual external payments plus credit, and credit-only checkout, in the core release.

Reserve credit at order creation and capture it exactly once at confirmation. Credit-only order confirmation and capture are atomic. Pending manual-payment orders retain reservations until explicit resolution: overdue review prompts staff action, and explicit cancellation releases funds. Do not release holds solely because a timer expired while an incoming transfer may remain unresolved. Optional hosted-provider failure/expiry permits release only after the provider outcome is established. Refund credit-funded portions to credit and external-funded portions through the corresponding settlement process by default, without exceeding original allocations. Admin UI alone is not completion: customer history, checkout, retries, refunds, and reporting must work together. Gift cards remain a separate later feature. The [main implementation plan](lightweight-commerce-implementation.md) is authoritative for Supastore lifecycle, funding and refund contracts.

## Lightweight implementation principles

1. Borrow Medusa's domain boundaries and merchant workflows while keeping Supastore's existing deployment and database. A full module framework or extra commerce service is unnecessary for these features.
2. Build vertical slices: schema/invariants, application command/query, admin flow, storefront consumption, failure tests, and migration all ship together.
3. Use a small shared table/list pattern rather than Medusa's extensive configurable-view settings system. URL-backed search/filter/sort/page state and a consistent empty state deliver the main benefit.
4. Keep product information separate from purchasable variants and accounting records. Historical order snapshots remain immutable when catalog labels change.
5. Begin with manual collections, one selling channel, existing supported currencies/locales, simple inventory policy, and existing payment/shipping providers. Defer bundles, marketplaces, pricing engines, loyalty points, and automation builders unless commercially needed.
6. Retain strong transactionality and idempotency for stock, payment, and credit. Lightweight means fewer services and smaller workflows, not weaker commerce correctness.

## Research limits

No Medusa installation was run. Findings reflect official documented behavior, not a hands-on usability benchmark. Automatic SKU generation was not verified as a native feature; treat it as an explicit Supastore enhancement. This document does not inventory Supastore's current schema or test coverage; the implementation plan must ground those separately in repository evidence.

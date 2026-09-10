# Product scope

## Product promise and audience

A small merchant can publish a product, accept an order, collect payment, fulfill it and return money without database access or a separate storefront project.

The initial audience manages availability manually and accepts payment before preparation. Standard physical products are supported, but the application does not prevent overselling scarce stock. Shops requiring inventory reservations or preparation before cash pickup are not the initial target.

## Release boundaries

| First release | Deferred |
| --- | --- |
| One business and currency per deployment | Multi-currency and multiple businesses |
| Storefront, admin and one configurable theme | Theme marketplace and plugin framework |
| Products, variants, categories and availability toggles | Quantitative inventory and reservations |
| Guest checkout and scoped email tracking links | Customer accounts, address books and account claiming |
| Unpaid order created before payment instructions | Store credit, wallets, mixed tender and installment plans |
| Manual transfers and staff-recorded cash | Hosted card checkout and automated payment integrations |
| Original-source refunds and excess-payment returns | Refund credit, loyalty and promotions |
| Price changes only before any receipt is recorded | Post-payment price-change proposals |
| Flat shipping rates and one optional pickup location | Carrier labels, calculated shipping and multiple pickup locations |
| Configured tax rates and one rounding policy | Automatic global tax compliance |
| Transactional email | Admin direct messages, SMS and WeChat |
| Product CSV import; product/order export | Order import and general data round-trip tooling |

Subscriptions, configurable products, marketplaces and arbitrary workflow builders are outside the product's initial direction. Deferred capabilities add no tables, navigation or startup dependencies until separately designed.

Receipt corrections cover wrong amounts and duplicate entries. Reassigning an existing receipt to another receiving account is deferred; detected wrong-account entries require an owner investigation hold and cannot be repaired by voiding and recreating the payment. A separate design must address identity collisions, funding and historical payouts before reassignment is supported.

Store credit and accounts are intentionally removed from first-release scope. No wallet, redemption, claim, pre-order payment owner or recovery-case subsystem belongs in core. Money is requested only after an order exists.

## Merchant defaults

Use one store timezone, currency and supported precision. Currency is locked after the first order is created, including free orders. English and Simplified Chinese are initial locales, with fallback to the default locale. Language never changes currency.

Shipping uses configured destinations, flat rates and an optional free-shipping threshold. Pickup uses one location, weekly opening intervals, blackouts and a minimum preparation notice; customers choose a valid time without capacity reservation. Customers may browse before selecting fulfillment. Switching fulfillment preserves the cart and explains incompatible items.

Cash is collected before confirmation and preparation. Manual methods expect the full order amount in one payment; staff can record multiple actual receipts to reconcile mistakes, but the product does not offer installment schedules or mixed-method checkout. An underpayment requires staff resolution and explicit customer agreement before requesting the outstanding amount.

Branding covers logo, colors, navigation, homepage sections and contact/policy pages. Admins can pause new orders without hiding the catalog or disabling existing order work. Unavailable products do not invalidate an already accepted purchase automatically; staff must assess fulfillability and cancel when necessary.

## Success criteria

A new merchant reaches a first test order using the guide. Staff can find unpaid orders, record receipts, print a packing slip, complete fulfillment and reconcile a refund through the admin. A contributor reproduces the demo and checks from a clean checkout. An operator restores database and assets with outbound delivery disabled and rehearses an upgrade.

Measure onboarding completion, time to the first test order, guest checkout completion and time to resolve ordinary payment/fulfillment tasks in a pilot. Publish deployment resource measurements and external-service requirements with the tested configuration.

## Specification ownership

This document controls scope. Business workflows control behavior and transitions. Transaction contracts control calculations, lock order and retry semantics. The data model describes storage responsibilities; journeys verify outcomes. Other documents link to those rules rather than introducing alternatives. All documents describe intended behavior, not implemented capability.

| Question | Authoritative document |
| --- | --- |
| Who is the product for, and what ships? | This document |
| What can a user do, and when? | [Business workflows](business-workflows.md) |
| How are money, locks and retries calculated? | [Transaction contracts](transaction-contracts.md) |
| What is stored and constrained? | [Data model](database-schema.md) |
| How are messages delivered and retained? | [Events](api-events-spec.md) |
| Where do code and authorization responsibilities live? | [Architecture](architecture-overview.md) |
| What demonstrates completion? | [User journeys](critical-user-journeys.md) |
| In what order is it built? | [Roadmap](production-tasks-roadmap.md) |
| How is it configured, deployed and recovered? | [Development and deployment](development-deployment.md) |
| How does a merchant operate it? | [Merchant guide](merchant-operations.md), a reader-facing summary of workflows |

Define each rule in its owner document. Elsewhere retain only the context needed by that audience and link to the rule. When changing behavior, update the owner first, then its acceptance coverage and roadmap references. Keep implementation suggestions distinct from requirements; summaries never override contracts. Milestone labels M0–M3 in the roadmap are distinct from merchant journey IDs M1–M6.

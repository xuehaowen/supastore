# Product scope

## Product promise and audience

A small merchant can publish a product, accept an order, collect payment, fulfill it and return money without database access. Backend and storefront are independently deployable applications in one workspace.

The audience sells physical goods through shipping, pickup or local delivery. Tracked variant stock, verified customer accounts and store-credit funding are existing foundations. One business and currency per deployment remains the boundary; the implementation adds optional slots, rewards, online payments and separate backend/storefront deployment.

## Release boundaries

| First release                                                  | Deferred                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| One business and currency per deployment                       | Multi-currency and multiple businesses                            |
| Storefront, admin and one configurable theme                   | Theme marketplace and plugin framework                            |
| Products, variants, categories and optional tracked inventory  | Multiple warehouses                                               |
| Guest/accounts, address books and proof-based order claiming   | Multi-tenant identities                                           |
| Unpaid order before instructions; credit plus external funding | Installment schedules and transferable wallets                    |
| Manual payments and online-payment adapter                     | General payment plugin framework                                  |
| Original-source refunds and configurable purchase rewards      | Reward expiry, transfers and historical backfill                  |
| Price changes only before any receipt is recorded              | Post-payment price-change proposals                               |
| Flat shipping rates and one optional pickup location           | Carrier labels, calculated shipping and multiple pickup locations |
| Configured tax rates and one rounding policy                   | Automatic global tax compliance                                   |
| Transactional email                                            | Admin direct messages, SMS and WeChat                             |
| Product CSV import; product/order export                       | Order import and general data round-trip tooling                  |

Subscriptions, configurable products, marketplaces and arbitrary workflow builders are outside the product's initial direction. Deferred capabilities require separate designs before release.

Receipt corrections cover wrong amounts and duplicate entries. Reassigning an existing receipt to another receiving account is deferred; detected wrong-account entries require an owner investigation hold and cannot be repaired by voiding and recreating the payment. A separate design must address identity collisions, funding and historical payouts before reassignment is supported.

Accounts, inventory and store credit are existing capabilities. The implementation adds configurable rewards and Stripe as the first online-payment adapter. This specification does not claim every expansion milestone has shipped; track implementation and acceptance in the [generic plan](../plans/generic-store-implementation.md). Money is requested only after an order exists.

## Merchant defaults

Optional [contextual commerce rules](commerce-evaluation.md) select variant
prices/availability, reward rates, shipping minimums and existing promotion
eligibility by fulfillment, destination, pickup location and activation dates.
They share the store's inventory and customer accounts. The backend revalidates
accepted terms; previews never reserve stock or issue credit.

Use one store timezone, currency and supported precision. Currency is locked after the first order is created, including free orders. English and Simplified Chinese are initial locales, with fallback to the default locale. Language never changes currency.

Shipping uses configured destinations, flat rates and an optional free-shipping threshold. Pickup/local delivery support optional schedules, order capacity and variant quotas. Customers may browse before selecting fulfillment. Switching fulfillment preserves the cart and explains incompatible items. One fulfillment method per order is supported. Quantity-based partial shipments are tracked separately; completion and reward release wait for all ordered units to be delivered.

Cash is collected before confirmation and preparation. Manual methods expect the full order amount in one payment; staff can record multiple actual receipts to reconcile mistakes, but store credit can fund part of a purchase; installment schedules are not offered. An underpayment requires staff resolution and explicit customer agreement before requesting the outstanding amount.

Branding covers logo, colors, navigation, homepage sections and contact/policy pages. Admins can pause new orders without hiding the catalog or disabling existing order work. Unavailable products do not invalidate an already accepted purchase automatically; staff must assess fulfillability and cancel when necessary.

## Success criteria

A new merchant reaches a first test order using the guide. Staff can find unpaid orders, record receipts, print a packing slip, complete fulfillment and reconcile a refund through the admin. A contributor reproduces the demo and checks from a clean checkout. An operator restores database and assets with outbound delivery disabled and rehearses an upgrade.

Measure onboarding completion, time to the first test order, guest checkout completion and time to resolve ordinary payment/fulfillment tasks in a pilot. Publish deployment resource measurements and external-service requirements with the tested configuration.

## Specification ownership

This document controls scope. Business workflows control behavior and transitions. Transaction contracts control calculations, lock order and retry semantics. The data model describes storage responsibilities; journeys verify outcomes. Other documents link to those rules rather than introducing alternatives. Documents define intended contracts; expansion targets do not imply completed migrations or release acceptance.

| Question                                               | Authoritative document                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Who is the product for, and what ships?                | This document                                                                  |
| What can a user do, and when?                          | [Business workflows](business-workflows.md)                                    |
| How are money, locks and retries calculated?           | [Transaction contracts](transaction-contracts.md)                              |
| What is stored and constrained?                        | [Data model](database-schema.md)                                               |
| How are messages delivered and retained?               | [Events](api-events-spec.md)                                                   |
| Where do code and authorization responsibilities live? | [Architecture](architecture-overview.md)                                       |
| What demonstrates completion?                          | [User journeys](critical-user-journeys.md)                                     |
| In what order is it built?                             | [Roadmap](production-tasks-roadmap.md)                                         |
| How is it configured, deployed and recovered?          | [Development and deployment](development-deployment.md)                        |
| How does a merchant operate it?                        | [Merchant guide](merchant-operations.md), a reader-facing summary of workflows |

Define each rule in its owner document. Elsewhere retain only the context needed by that audience and link to the rule. When changing behavior, update the owner first, then its acceptance coverage and roadmap references. Keep implementation suggestions distinct from requirements; summaries never override contracts. Milestone labels M0–M3 in the roadmap are distinct from merchant journey IDs M1–M6.

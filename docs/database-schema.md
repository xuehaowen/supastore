# Data model

This is a conceptual model, not executable SQL. Add Drizzle schemas and migrations with each vertical slice; do not generate the entire planned schema as a foundation milestone. [Workflows](business-workflows.md) own behavior and [transaction contracts](transaction-contracts.md) own accounting.

## Conventions

Authentication uses shared `user`, `account` and `verification` records, with separate customer `session` and merchant `staff_session` tables. Each session table has independently unique tokens and a cascading user foreign key. Staff sessions have an index on user ID for listing/revocation. Migration 0038 introduces staff sessions without promoting historical customer rows. Password reset revokes both tables; ordinary session operations remain scoped to their realm.

UUID IDs, UTC instants and explicit IANA timezones. Monetary snapshots carry currency and precision. Use restrictive foreign keys for financial history and soft deletion for catalog entities. Administrative changes include actor, reason, revision and request identity. Applied financial history is append-only; projections are derived.

## Store and catalog

| Entity                      | Data and constraints                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| store_settings              | Branding, ordering/launch state, currency/precision, default locale/timezone, support and policy content, quote-relevant version; lock currency after first order                                |
| staff_memberships           | Auth user, owner/staff role, active state; server-managed; prevent removal of the last active owner without a protected recovery/transfer process                                                |
| products / product_variants | Published state, unique handles/SKUs, descriptive attributes, integer price, availability, tracked-stock policy, image keys, quote-relevant versions; stored generated search vector and indexes |

## Generic expansion storage contract

This section defines required storage, not proof that migrations/use cases are complete. Preserve existing IDs, aggregate credit ledger, stock movement history, legacy pickup-slot foreign keys and immutable purchase snapshots. Additive upgrades must pass clean-install and forward-upgrade acceptance; provenance backfill requires financial replay and quarantines unreconciled origins.

Generic fulfillment slots reference method plus pickup location or delivery service area, stable local date/window and timezone snapshot. Legacy pickup references map uniquely without inserting delivery areas into pickup-location foreign keys. Separate order-capacity bookings and variant quotas from global stock; null is unlimited and zero unavailable. Reservation request identities, terminal states and nonnegative quantities prevent double release/consumption. Dispatch and recorded delivery are distinct persisted transitions; one fulfillment per order remains unique.

Reward policy/order snapshots persist version, accepted verified customer, rate, eligibility and original component/external/credit allocations. Reward issuance lots retain immutable source-entry/order lineage. Source allocations identify reservation/capture/refund amounts with scoped foreign keys and uniqueness. Debt/recovery records retain affected reward source and unique operation identity; existing one-reversal-per-entry storage cannot represent cumulative partial reversals by itself. Database checks enforce nonnegative integer components; transactional reconciliation enforces sums against aggregate funding/ledger.

Online payment intents and authenticated provider inbox records require stable request/provider identities, unique deduplication and reconciliation state. Accepted redirects are not receipt rows. Provider expiry metadata is distinct from manual review deadlines. See [transaction contracts](transaction-contracts.md) for allocation/locking and [event contracts](api-events-spec.md) for inbox/outbox behavior.

Reward reconciliation records distinguish nonnegative cumulative reversal and restoration increments. Append-only reward funding-review records retain order, owner, verified evidence reason, request identity and payload fingerprint. Clearing a review requires authoritative original-source verification and an audited atomic source/debt/aggregate adjustment; it does not rewrite accepted reward snapshots or financial history. UTC activation windows and category allowlists reside in validated store commerce policy; accepted quotes freeze active state and accepted order lines freeze eligibility.
| categories / translations | Category membership and relational entity+locale translations; one default locale and deterministic fallback |
| shipping_zones / shipping_rates | Supported destinations, flat amount/free threshold, active state and deterministic priority |
| pickup_settings | At most one location; timezone, weekly intervals, blackouts and preparation notice; no capacity reservations |
| tax_settings | Explicit enabled state, inclusive/exclusive rates and supported destinations; calculation policy version |
| payment_accounts / payment_methods | Durable real-account or cash-drawer identity; unique verified account identity, aliases, normalization version, archive state; labels/instructions refer to accounts and do not define identity |

Preserve raw external references and versioned normalization. Account aliases must resolve to the same identity; normalization changes require collision-checked migration. Archived accounts remain usable for historical reconciliation and original-source returns.

## Guest purchase and access

| Entity                                    | Data and constraints                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| guest_sessions                            | Server-side secret hash, expiry and revocation; credential held in HTTP-only secure cookie (`__Host-` prefixed where supported) with client storage fallback; no access by contact text; expire credentials after 30 days and retain referenced ownership rows as described below                                                                            |
| carts / cart_items                        | Guest owner, revision, quantities, selections and converted-order link; one conversion per cart; un-converted carts purged after 30 days                                                                                                                                                                                                                     |
| quotes                                    | Cart/revision, expiry, accepted-input versions and immutable calculation/fulfillment/method snapshot; no payment instructions before order creation                                                                                                                                                                                                          |
| orders / order_versions                   | Unique source cart, creation request, internal order UUID, display order number and human-friendly short payment reference code (e.g. Crockford Base32 checksummed `SP-XXXX` with unique index and generation collision retry for bank transfer memos); guest/contact/locale snapshots, accepted version, lifecycle, financial revision and review deadlines |
| order_items / order_totals                | Accepted item and calculation snapshots; positive quantities, nonnegative components/payable total, currency consistency; prior versions retained                                                                                                                                                                                                            |
| order_change_proposals                    | One pending proposal, base accepted version, proposed pre-receipt price/terms, owner reason, acceptance/withdrawal/invalidation history                                                                                                                                                                                                                      |
| order_change_acceptances                  | Proposal, accepted version, scoped customer actor/time and stable request identity; cash/owner-assisted acceptance retains customer-agreement evidence                                                                                                                                                                                                       |
| order_access_tokens / order_sessions      | Order-scoped secret hashes, expiry, purpose, single-use exchange/revocation state; immediate client session storage retention upon placement; email recovery issuance metadata                                                                                                                                                                               |
| order_fulfillments                        | Exactly one per order; accepted address/location/time snapshot, audited corrections, carrier/tracking, fulfillment state and schedule revision                                                                                                                                                                                                               |
| payment_upload_intents / payment_evidence | Existing order, guest owner, unique private object key, expected size/type, expiry, pending/finalized/expired state; worker garbage collects unfinalized expired objects; review status and reason separate from receipts                                                                                                                                    |

Upload intents retain staging keys and finalization candidate identities. Payment evidence references only an immutable server-written final key with validated size, type and content digest. Track active candidate finalizations durably so cleanup cannot race a finalization; no client upload grant can write final keys.

The finalization procedure belongs to the [payment evidence workflow](business-workflows.md#3-payment-and-confirmation).

Owner-created orders use the same quote/order use case with an owner-controlled draft cart and creation reason. Owner creation does not bypass customer agreement to changed terms or financial invariants.

## Financial history

| Entity                                         | Data and constraints                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| payment_receipts                               | Exactly one order owner; amount/currency, durable account ID, raw/canonical reference, normalization version, staff actor/time and collection request; unique account+canonical reference                                                                          |
| cash receipt metadata                          | Immutable generated receipt number, drawer, payer and collection time; retries retain identity                                                                                                                                                                     |
| confirmation_funding                           | Original per-receipt funding snapshot; sums to confirmed P and excludes later receipts                                                                                                                                                                             |
| refund_authorizations                          | Order, purchase or open-cancellation kind, immutable amount/source allocations, purchased components when applicable, owner/reason and request key                                                                                                                 |
| payment_returns                                | Order-owned excess/late/supplemental return, source allocations and reason; unique correction+receipt identity for supplemental returns                                                                                                                            |
| payout_allocations                             | Receipt and refund/return reference, original authorization and append-only correction revisions; matching owner/currency; settled portions retained                                                                                                               |
| payout_attempts                                | Allocation, owner actor, stable attempt ID, claimed amount, sending/reconciled/no_transfer state and evidence; one unresolved attempt per allocation                                                                                                               |
| payout_destination_verifications               | Receipt, immutable destination revision, payer/source verification evidence reference, owner actor/time; distinguish payer destination from merchant account; cash recipient verification where applicable                                                         |
| payout_discrepancies / payout_error_recoveries | Attempt-owned case, open/resolved state, order hold, immutable actual destination/amount/evidence, customer-settlement and error classifications, owner review/write-off decision; append-only recoveries with unique transfer identities and capped recovery sums |
| outgoing_transfers                             | Attempt/allocation, actual amount, durable original account, unique canonical outgoing reference and timestamp; cash number and recipient acknowledgment for cash                                                                                                  |
| receipt_correction_cases / affected_orders     | Evidence, base revisions, open/applied/dismissed state and owner audit; at most one open case per affected order; supports cross-order duplicate investigation                                                                                                     |
| receipt_corrections                            | Original receipt, signed delta, optional surviving duplicate receipt, case/request identity; retain original references even after voiding                                                                                                                         |
| allocation_revisions / funding_loss_entries    | Audited correction plan, unsent reductions, derived funding shortfall changes and reconciliations; never rewrite settled transfers                                                                                                                                 |

Balances, effective funding and refund extent use the canonical projection rather than independently editable counters. Per-receipt aggregate limits are enforced under the order/receipt locks. Unique indexes alone do not enforce sums.

Receipt account/currency/reference identity is immutable. First-release corrections support amount deltas and duplicate voids only; wrong-account investigations remain held pending a separately designed reassignment capability. No reassignment table or implicit void/recreate repair is part of this release.

Payout attempts retain the original claimed amount, cumulative customer settlement and evidence establishing finality when closed as reconciled. These settlement values are derived from immutable transfers. A partial transfer does not close an attempt while any remainder is uncertain. Actual transfer classification C/E follows the exact transaction formula and cannot be entered independently by an operator.

Customer settlement is capped by the allocation's remaining authorization, not the attempt's claim. Derive claim-limit breach separately from cumulative actual outgoing amounts. Discrepancy cases support monetary error, claim-limit breach and late-evidence reasons, including cases with zero error loss. Attempts carry a reconciliation_required actionability flag: a flagged unresolved replacement retains exclusivity but cannot supply send instructions. Late-evidence case creation, replacement flags and transfer classification commit atomically; resolution audit records each affected attempt's evidenced outcome.

Every payout attempt references its verified destination revision; the verification, receipt and allocation must share the same owner. Destination revisions and settled transfer destinations are immutable. Store destination details privately and exclude them from ordinary logs and public order views.

Outgoing transfers retain actual destination and amount separately from immutable claim intent, including discrepancies. Store customer-settlement and erroneous-disbursement components according to the transaction contract. One physical transfer has one identity across both reconciliation paths. Payout discrepancy holds block replacement claims until reviewed resolution; outstanding customer entitlement survives write-off.

## Audit, delivery and imports

| Entity                               | Data and constraints                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| operation_requests / audit_records   | Scoped command key, canonical input fingerprint, original result reference, actor/reason and old/new revision; financial identities retained                                                     |
| outbox_events                        | Unique business event identity, order aggregate sequence, versioned immutable payload and committed timestamp                                                                                    |
| event_deliveries / delivery_attempts | Unique event+recipient+channel, provider key, lease token/expiry, attempts, retry time and terminal/suppressed state; indexed on `(status, retry_after) WHERE status IN ('pending', 'retrying')` |
| import_jobs / import_rows            | Product validation preview, file/input identity, selected rows, applied IDs and results for retry-safe import                                                                                    |

No customer accounts, wallets, credit ledgers, pre-order receipts, recovery cases, installment plans or price-change payout proposals belong in first-release migrations.

## Retention and automated housekeeping

Migration 0039 adds nullable `failure_code` and `expires_at` to deliveries.
Authentication events use an independent `auth` aggregate and a 15-minute
dispatch deadline. Never-submitted expired review records can be suppressed
without provider reconciliation. Stripe inbox and checkout attempts add
`reconciliation_attempts`, `retry_after` and `failure_code`, with indexes on
status/retry time. Pollers reserve one record immediately before provider I/O;
failed records back off independently. See [error handling](error-handling.md).

To prevent PostgreSQL table and index bloat over long-running operations without external services, the background worker executes lightweight periodic housekeeping:

- **Abandoned Carts and Guest Credentials:** Purge unconverted carts after 30 days. At 30 days expire guest credentials and clear their secret hashes. Delete a guest-session row only when no retained cart, request identity or other history references it; otherwise retain an inert ownership row. Converted carts and their source-order references remain intact. Credential expiry does not delete independently scoped order sessions or financial history. Test cleanup with both abandoned carts and converted carts referenced by old orders.
- **Delivery History:** Follow the events retention contract. Keep actionable exhausted deliveries and their exact retry material regardless of age. Prune payloads only 30 days after delivery or explicit resolution/suppression, with no active lease/retry and only when all event deliveries are eligible. Retain identity tombstones and resolution audit; serialize cleanup against retry.
- **Unfinalized Upload Intents:** Upload intents in `pending` status that exceeded their TTL are marked expired and their temporary object keys purged from object storage.

## Migration and access verification

Use positive-quantity checks, owned foreign keys, request/reference uniqueness and immutable-history protection. Enable RLS and explicitly verify browser, runtime and migration-role privileges. Index published catalog lookup, guest-scoped orders, admin queues/deadlines, pending deliveries and financial identities. Test clean install and forward upgrade with every slice, including private storage policies where introduced.

## Catalog translation storage

`product_translations`, `category_translations`, `attribute_translations`,
`attribute_value_translations`, and `variant_translations` each hold one row per
entity and locale, with a unique entity/locale index and cascading translation
cleanup. Category and attribute translations provide `name`, attribute values
provide `label`, and optional custom variant translations provide `title`.

`attributes` has a globally unique stable `code` and a base-language `name`.
`attribute_values` has a code unique within its attribute and a base-language
`label`. Both include sort order. `variant_attribute_values` allows one value per
attribute per variant; a composite foreign key ensures that value belongs to the
specified attribute. Assigned values cannot be deleted until unlinked; deleting
a variant removes its assignments and translations.

Migration 0005 adds this storage without converting existing variant attribute
JSON. Storefront readers use normalized assignments when available and retain the original variant title for legacy variants. General backfill, normalized attribute editing, and translation editing are follow-up application work. Locale validation remains an application concern,
and writers must explicitly update `updated_at` when editing rows.

Demo seed data includes `attributes.yaml` with stable attribute/value codes and
Chinese display translations. Categories and variants declare their own
translations; variant `attributeValues` maps stable codes to value codes while
legacy `attributes` retains display labels for existing readers. The seed loader
upserts these translations and assignments in a transaction, including for
existing demo products. Undeclared rows are retained. Unknown attribute values or
missing referenced entities fail the transaction. Run the existing guarded
`db:seed` command against an isolated demo database after reviewing the YAML.

Storefront category filters, product details, variant options, and cart titles
resolve requested locale, then store default locale, then original text. Empty
translated strings are intentional and do not trigger fallback. Variant titles
prefer a translated custom title; otherwise normalized attribute value labels
form a title in attribute sort order, with the original title used when no
assignments exist. Option labels also expose translated attribute names. Locale
is part of the existing cached product/catalog function arguments; after changing
translations, invalidate the `catalog` cache tag or allow its TTL to expire.

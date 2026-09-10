# Architecture overview

## Deployment and stack

Use a modular monolith: one Next.js (App Router, Node.js standalone output) application containing the customer storefront, explicit `/admin` routes, and backend endpoints. Route groups organize code cleanly and confer no authorization.

### Frontend Architecture & Bundle Isolation
- **Customer Storefront:** Rendered via **React Server Components (RSC)** in React 19 / Next.js 15 with static/incremental generation (SSG/ISR) for public catalog browsing. Client-side JavaScript is strictly limited to isolated interactive islands (cart drawer, quantity counters, reference copy buttons, evidence file uploader), targeting 50KB gzip of total public-route client JavaScript, including framework runtime. This budget is unverified and must be measured and revised from evidence. Shared validation logic utilizes lightweight schema validation (**`valibot` v1.0+**) rather than heavyweight runtime libraries.
- **Merchant Admin:** Full-featured operational dashboard under `/admin` built with **Tailwind CSS v4, shadcn/ui (Radix UI primitives), and Lucide React**. Loaded on demand strictly for authenticated staff routes.
- **Localization:** Managed via `next-intl` with English and Simplified Chinese as default locales.

### Data Layer & Concurrency
- **Drizzle ORM & PostgreSQL 16+ via `postgres.js`:** Drizzle defines the schema and versioned migrations without heavy binary engines. Database connections use `postgres.js` in direct session mode (or connection-pinned transaction pools) to guarantee that explicit `SELECT ... FOR UPDATE` row locks and advisory locks remain held for the full duration of financial use-case transactions. When using connection poolers (e.g. Supabase, PgBouncer, Neon), the application connection must target direct session mode rather than statement-pooling ports.
- **Native Search:** Catalog search uses PostgreSQL native full-text search with a stored generated column (`tsvector` + GIN index) and trigram matching (`pg_trgm`), eliminating runtime query conversion overhead and removing any need for external search daemons (e.g., Elasticsearch or Meilisearch).
- **Transactional Outbox & Worker:** Event notification delivery uses an `outbox_events` and `event_deliveries` table processed via `SELECT ... FOR UPDATE SKIP LOCKED` and PostgreSQL advisory locks (`pg_try_advisory_xact_lock`). No external broker daemon (Redis/BullMQ/RabbitMQ) is required.

### Unified Deployment & Process Model
The planned application packages into one Docker container running a single Node.js 22 LTS standalone process. The <80MB image and 256–512MB application memory budgets are unverified targets; measure the supported configuration before claiming them:
1. **Single Unified Engine:** Standardizes on **Better-Auth** (storing users and sessions directly in PostgreSQL via Drizzle) and the **S3-compatible API** (`@aws-sdk/client-s3`), eliminating multiple fragmented auth/storage implementations.
2. **Universal Portability:** Connects to any standard PostgreSQL 16+ instance via `DATABASE_URL` (local container, self-hosted VPS, or cloud-managed PostgreSQL such as Supabase, Neon, or AWS RDS). Object storage connects to any S3-compatible backend (Cloudflare R2, MinIO, AWS S3, or Supabase Storage).
3. **Worker placement:** An in-process loop is the default; worker-only container mode is optional. In the standalone Next.js container, the loop initializes safely via `instrumentation.ts` (`register()` hook, guarded to `process.env.NEXT_RUNTIME === 'nodejs'`) or a server runner. Both implement the same [delivery and coordination contract](api-events-spec.md#worker-lifecycle-and-retry). Operators configure supervision through the [deployment guide](development-deployment.md#configuration-and-process-supervision).

### Redis-Free Rate Limiting & Abuse Defense
Public endpoints (guest order submission, recovery link requests, payment evidence upload, and admin login) enforce multi-tier rate limiting without Redis:
- **Layer 1 (Network / Reverse Proxy):** Configure and verify rate limiting supported by the chosen proxy build or edge provider; document required modules and configuration.
- **Layer 2 (Application In-Memory Token Bucket):** Lightweight in-memory LRU cache (`lru-cache`) inside the Node process for fast IP/session-level throttling on public endpoints.
- **Layer 3 (Database Attempt Tracking):** Sensitive authentication, recovery tokens, and upload intent creations record attempt timestamps in PostgreSQL with atomic rate checks.

## Module boundaries

| Module | Owns |
| --- | --- |
| Store | Settings, onboarding, launch readiness and staff permissions |
| Catalog | Products, variants, translations, assets and product import |
| Orders | Carts, quotes, purchase snapshots, order creation and cancellation |
| Payments | Accounts, receipts, corrections, refund/return allocations and payouts |
| Fulfillment | Shipping/pickup snapshots, preparation, tracking and completion |
| Notifications | Event delivery, templates, ordering and provider adapter |

Application use cases coordinate modules. Modules expose explicit functions and types; they do not mutate another module's tables through arbitrary UI code. Notifications consume committed events and never change financial state. Public catalog reads may use focused query functions without routing through a generic repository abstraction.

## Code responsibilities and transaction ownership

The intended dependency direction is UI/routes -> application use cases -> domain functions and persistence. External adapters implement narrow interfaces at the edge.

- UI/routes parse input, establish authenticated/scoped identity and invoke a use case. They never trust submitted prices or permissions.
- Application use cases enforce authorization, acquire locks and own the complete database transaction.
- Pure domain functions calculate totals, balances and legal transitions from explicit inputs. They do not read the network, clock or database implicitly.
- Drizzle persistence executes queries in the transaction supplied by the use case. Constraints, foreign keys and unique indexes enforce row integrity and uniqueness.
- Adapters handle Auth, Storage and email outside financial transactions.

**TypeScript application services using Drizzle transactions own business operations.** Do not maintain a second business workflow implementation in PostgreSQL functions, server actions or triggers. Small database primitives may enforce storage-level constraints when necessary; document them in migrations. Multi-row aggregate invariants are checked under the shared locks in the application transaction.

A command such as `createOrder`, `recordReceipt`, `confirmOrder`, `cancelOrder`, `authorizeRefund` or `reconcilePayout` has one implementation called by every entry point. Pricing is one pure calculation used by quoting and permitted pre-payment adjustments. See [transaction contracts](transaction-contracts.md).

## Authorization boundary

All business mutations and private reads go through trusted server use cases. Use a dedicated least-privilege database role for application access; reserve elevated credentials for migrations and narrowly scoped platform administration. Enable RLS on exposed application tables and deny direct browser financial access. RLS is defense in depth and does not replace use-case authorization. Document and test the actual privileges of the chosen runtime role.

| Actor | Allowed actions |
| --- | --- |
| Visitor | Read published catalog; maintain an owned guest cart |
| Scoped guest | Create an order from their cart; read that order, upload its evidence and request a new tracking link |
| Staff | Read operational orders/evidence, record receipts, confirm, prepare, track and complete fulfillment |
| Owner | Staff actions plus configuration, staff management, exports, price adjustments, cancellation, refunds, corrections and payout execution |

The first release deliberately limits financial authority to the owner; staff cannot grant themselves privileges. Every private use case explicitly queries `staff_memberships` in the database to verify active status and role inside the transaction, ensuring immediate revocation without waiting for cached JWT claims to expire. Protect initial owner setup with a deployment-held secret and disable bootstrap atomically after success. Provide a documented owner recovery process without a public takeover route.

Guest access uses secret hashes, bounded expiry and order-scoped authorization. Email/order-number text alone grants nothing. Verification links are single-use and exchange for a bounded scoped session held in an HTTP-only secure cookie (e.g. `__Host-supastore-order-session` with `SameSite=Lax`). Reissuing access is rate-limited and returns a generic response that does not reveal order existence. Redact tokens and private details from logs.

Public product assets and private payment evidence use separate storage policies. Public catalog images use immutable CDN caching headers (`Cache-Control: public, max-age=31536000, immutable`). Private payment evidence is stored in a private bucket accessible only via bounded-TTL presigned download URLs (15-minute expiry) issued to authorized staff or scoped guests. Storage adapters support direct client uploads via presigned URLs; upload finalization inspects file magic bytes via an efficient partial byte-range request (`Range: bytes=0-2047`) on the candidate object, validating against declared MIME type and size without buffering full files in server memory. The background worker runs an idempotent cleanup job to purge unfinalized storage objects whose upload intents have expired. Evidence is optional per method and never proves receipt of funds by itself.

## Reliability and extensibility

Detailed reliability contracts have one owner: [workflows](business-workflows.md) for immutable evidence and administrative holds, [transaction contracts](transaction-contracts.md) for money and concurrency, and [events](api-events-spec.md) for delivery and retention. Implement those contracts at the module boundaries above.

Separate lifecycle, payment balance/review and fulfillment states. Preserve immutable purchase and receipt history; audit administrative actions. Use stable request keys, owner locks and a transactional outbox. No network calls occur while holding financial locks.

Keep the default installation small: no Redis, general event bus, generic plugin framework or event-sourced reconstruction of the whole store. Add payment/email adapters through small interfaces when another implementation is actually needed. Publish performance claims only after measuring the supported configuration.

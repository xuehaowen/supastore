# SupaStore

A planned online store for small merchants who manage availability manually and collect payment before preparing orders. Storefront, merchant admin and backend run in one deployment.

**Status: design stage.** There is no runnable application yet. The [roadmap](docs/production-tasks-roadmap.md) starts with a complete synthetic order lifecycle. Licensed under MIT.

Customers accept a quote and create an unpaid order before receiving payment instructions. Staff records actual payment, confirms the order and fulfills it. Guest access and request recovery preserve the existing order after interrupted requests.

The first release targets one business and currency, physical products, simple shipping and optional pickup. Quantitative inventory, card checkout and customer accounts are deferred. See [scope and limitations](docs/product-scope.md).

The planned stack is Next.js, React, TypeScript, Drizzle and PostgreSQL, with database-backed authentication, S3-compatible storage and transactional email. [Architecture](docs/architecture-overview.md) owns the versions and design decisions; [deployment](docs/development-deployment.md) defines operational verification. Performance budgets remain unmeasured targets.

## Reading the specifications

Start with scope, then workflows. Use the specialized contracts when implementing a feature.

| Document | Purpose |
| --- | --- |
| [Product scope](docs/product-scope.md) | Audience, release boundary and document ownership |
| [Business workflows](docs/business-workflows.md) | User operations and state transitions |
| [Transaction contracts](docs/transaction-contracts.md) | Financial calculations, locking, retries and executable examples |
| [Data model](docs/database-schema.md) | Entities, relationships, constraints and retention |
| [Events](docs/api-events-spec.md) | Notification contracts and worker coordination |
| [Architecture](docs/architecture-overview.md) | Stack, module boundaries and authorization |
| [User journeys](docs/critical-user-journeys.md) | Acceptance outcomes and verification coverage |
| [Release roadmap](docs/production-tasks-roadmap.md) | Implementation order and milestone gates |
| [Merchant guide](docs/merchant-operations.md) | Intended setup and daily operations |
| [Development and deployment](docs/development-deployment.md) | Development, hosting, backups and upgrades |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [LICENSE](LICENSE). Specifications describe intended behavior; supported commands and deployment claims require runnable evidence.

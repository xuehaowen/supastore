# Contributing

SupaStore is a design-stage project. Start with [scope](docs/product-scope.md), [architecture](docs/architecture-overview.md) and the [vertical-slice roadmap](docs/production-tasks-roadmap.md).

Use issues for reproducible problems or bounded proposals grounded in merchant needs. Keep first-release scope small. Do not reintroduce accounts, store credit, pre-order payment recovery or post-payment price proposals without an accepted scope change.

Specification ownership is explicit: scope defines capabilities; workflows define operations; transaction contracts define calculations/locking/retries; the schema defines persistence; journeys verify outcomes. Link to authoritative rules rather than copying procedures into every document. Keep affected contracts consistent when changing behavior.

Implementation contributions use one application use case per command, thin routes and shared pure calculations. Add migrations with the feature, not a speculative complete schema. Include authorization and behavior checks, financial examples when relevant, migration/upgrade effects and documentation for setup requirements. Prefer small changes and narrow adapters over extension frameworks.

Pull requests explain the user-visible result and actual verification. No application scripts exist yet; do not invent working commands or claim runtime checks passed. Use synthetic data and never commit credentials or private customer/payment records.

The project is licensed under the [MIT License](LICENSE). Contributors must ensure that code contributions adhere to the architecture, unidirectional dependencies, transactional outbox patterns and test-driven financial contracts specified in the `docs/` directory. No CLA or commercial restriction applies. Publish issue/PR templates and review expectations in the foundations milestone.

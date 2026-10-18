# Contributing

SupaStore is an implemented, self-hosted commerce application. Start with [scope](docs/product-scope.md), [architecture](docs/architecture-overview.md) and the [vertical-slice roadmap](docs/production-tasks-roadmap.md).

Use issues for reproducible problems or bounded proposals grounded in merchant needs. Keep proposals aligned with the current capabilities and documented transaction contracts.

Specification ownership is explicit: scope defines capabilities; workflows define operations; transaction contracts define calculations/locking/retries; the schema defines persistence; journeys verify outcomes. Link to authoritative rules rather than copying procedures into every document. Keep affected contracts consistent when changing behavior.

Keep repository documentation, plans and deployment examples generic. Use synthetic merchant data, reserved example domains and neutral project/database names. Keep actual merchant branding, domains, hosting-account details and private operating decisions in deployment configuration or private merchant records. Describe merchant-specific requirements as configurable capabilities or optional examples, not platform defaults. Preserve verification results and their limitations without including merchant identity.

Implementation contributions use one application use case per command, thin routes and shared pure calculations. Add migrations with the feature, not a speculative complete schema. Include authorization and behavior checks, financial examples when relevant, migration/upgrade effects and documentation for setup requirements. Prefer small changes and narrow adapters over extension frameworks.

Pull requests explain the user-visible result and actual verification. Follow the [error-handling contract and coverage matrix](docs/error-handling.md): mutations and integrations must define failure categories, diagnostics, retry/uncertainty policy and regression tests. Update the matrix for new failure paths. Run `pnpm run test:errors` alongside the relevant integration/browser checks. Use the scripts in package.json to verify changes and report the checks actually run. Use synthetic data and never commit credentials or private customer/payment records.

The project is licensed under the [MIT License](LICENSE). Contributors must ensure that code contributions adhere to the architecture, unidirectional dependencies, transactional outbox patterns and test-driven financial contracts specified in the `docs/` directory. No CLA or commercial restriction applies. Publish issue/PR templates and review expectations in the foundations milestone.

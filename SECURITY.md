# Security reporting

Supastore is an implemented, pre-1.0 commerce application. Developer-beta status does not establish production acceptance or a long-term security-support window. There is no supported stable production release yet. Use the current default branch or the latest developer beta when one is published; older snapshots have no backport commitment.

## Report privately

[Report a vulnerability privately](https://github.com/xuehaowen/supastore/security/advisories/new). GitHub private vulnerability reporting is enabled. Reports are handled by the repository owner and maintainers through GitHub security advisories. Do not open a public issue with an exploit, credentials, customer data or deployment details.

Include the affected commit/release, deployment mode, impact, a minimal synthetic reproduction, and suggested mitigation if known. Remove real customer/payment records and secrets. A report does not require a public proof of exploitation.

The maintainers assess impact, reproduce the issue, coordinate a fix and publish an advisory when appropriate. No guaranteed response time, bounty or disclosure deadline is offered. Coordinate disclosure privately; do not assume an unanswered report is safe to publish. Maintainers must keep GitHub security notifications enabled and arrange coverage before advertising a supported production release.

## Release checks

Follow [Security deployment](docs/security-deployment.md) for staff MFA enrollment, shared authentication limits, trusted ingress and response/upload boundaries. MFA enrollment is per staff account; it is not globally enforced.

Review customer/staff authorization, private order proofs, financial invariants, storage access, dependency updates, migrations and backup/restore behavior. Publish affected/fixed versions and upgrade guidance with security fixes. Deployment credentials, backups and merchant-specific evidence stay outside the repository.

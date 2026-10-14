# Deployable applications

Independently built backend and customer storefront applications, each with its own source and configuration.

## When working here

Business state is backend owned. Separate storefront must communicate through HTTP contracts and receive no backend secrets.

## Where to start

- [Backend application](backend/README.md): Merchant admin, APIs, database, authentication and workers.
- [Separate customer storefront](storefront/README.md): Independent Next.js customer app using backend APIs and same-origin proxying.

## More context

[Parent overview](../README.md) · [Deployment guide](../docs/two-service-deployment.md)

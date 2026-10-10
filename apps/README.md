# Deployable applications

Backend launcher and independently built customer storefront.

## When working here

Business state is backend owned. Separate storefront must communicate through HTTP contracts and receive no backend secrets.

## Where to start

- [Backend application launcher](backend/README.md): Package scripts launch the root Next.js application through scripts/backend.mjs.
- [Separate customer storefront](storefront/README.md): Independent Next.js customer app using backend APIs and same-origin proxying.

## More context

[Parent overview](../README.md) · [Deployment guide](../docs/two-service-deployment.md)

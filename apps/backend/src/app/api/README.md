# Backend HTTP endpoints

Commerce, authentication, evidence, assets, health, and signed provider callback routes.

## When working here

Validate identity, origin and bounded inputs before use cases. Auth, asset and callback routes use their own protocols; do not assume the commerce JSON envelope everywhere.

## Where to start

- [Order placement](v1/orders/route.ts): Customer order creation endpoint.
- [Commerce helpers](../../infrastructure/http/commerce-api.ts): Origin checks, bounded JSON input and response conventions.
- [Authentication](auth/%5B...all%5D/route.ts): Better Auth handler.
- [Stripe callback](payments/stripe/webhook/route.ts): Signed payment-provider events.
- [Readiness](health/ready/route.ts): Backend readiness check.

`v1/` groups commerce APIs; `admin/` exposes merchant data tools; `evidence/` handles private payment proof. Callback endpoints validate provider signatures rather than browser mutation origins.

## More context

[Parent overview](../README.md)

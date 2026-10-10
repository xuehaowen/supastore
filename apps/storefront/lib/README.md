# Storefront HTTP and display helpers

API/client calls, streaming backend proxy, trusted-edge IP handling, locale, money, SEO and analytics.

## When working here

No direct database/provider imports. Preserve approved cookies/origin and reject spoofed forwarding headers. Analytics requires the configured consent behavior.

## Where to start

- [api.ts](api.ts): Server-side backend reads forwarding the incoming cookie context and requiring a shared response decoder.
- [client.ts](client.ts): Browser commerce requests; decoded results are typed, unconsumed results remain unknown.
- [response.ts](response.ts): Envelope checks and safe upstream error messages.
- [backend-proxy.ts](backend-proxy.ts): Streaming same-origin API proxy.
- [trusted-edge-ip.ts](trusted-edge-ip.ts): Validates the optional trusted ingress client-IP contract.
- [i18n.ts](i18n.ts): Storefront locale and copy helpers.

- [English](locales/en.json) and [Chinese](locales/zh.json): Storefront dictionaries; keep keys and placeholders aligned.

## Related paths and checks

- The proxy strips spoofed forwarding/IP headers and preserves approved browser cookie/origin context. Trusted ingress identity is opt-in.
- Checks: colocated `api.test.ts`, `backend-proxy.test.ts`, `trusted-edge-ip.test.ts`, `amount.test.ts`, `analytics.test.ts`.
- Public discoverability uses `seo.ts` and app robots/sitemap; optional analytics must respect consent. Backend database/storage/payment secrets must not reach this app.

## More context

[Parent overview](../README.md) · [Deployment guide](../../../docs/two-service-deployment.md)

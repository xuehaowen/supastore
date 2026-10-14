# Capability adapter registries

Each capability has its own contract and registry. Business code uses the contract;
vendor-specific HTTP formats and credentials stay inside infrastructure adapters.

| Capability             | Contract          | Registry                          | Stable handles                    |
| ---------------------- | ----------------- | --------------------------------- | --------------------------------- |
| Email                  | `EmailSender`     | `notifications/email-adapters.ts` | `nodemailer`, `nodemailer-oauth2` |
| SMS                    | `SmsSender`       | `notifications/sms-adapters.ts`   | `telnyx`                          |
| Phone verification     | `PhoneVerifier`   | `notifications/phone-adapters.ts` | `telnyx`                          |
| Hosted online payments | `PaymentProvider` | `payments/payment-adapters.ts`    | `stripe`                          |

Registries live under `src/infrastructure`. A handle is unique within its
capability. Phone verification retains the existing configuration handle
`telnyx` and persisted provider identity `telnyx-verify`; neither changes as part
of this refactor. Email verification and password recovery remain owned by Better
Auth, using `EmailSender` only for transport. Manual prepaid payments use the
existing receipt/confirmation workflows and do not require an online adapter.

## Adding an adapter

1. Implement the capability interface from `apps/backend/src/application/ports`. Keep vendor
   response mapping, authentication, deadlines and sanitized errors in the adapter.
2. Define a configuration discriminator and add it to the capability's config union.
3. Register an `AdapterDefinition` with a stable `handle`, `parseEnvironment`,
   `validateConfig`, and `create`. The mapped registry checks that the handle matches
   the configuration type and that factories return the capability interface.
   Notification entries also provide `configurationFingerprint` through
   `ProfiledAdapterRegistry`. Include only public profile identity and effective
   behavior settings, never credentials. This keeps singleton configuration fencing
   extensible without adding vendor-specific fingerprint branches.
4. Inject transports/fetchers through the factory dependencies. Parsing and validation
   must not perform network calls. Unknown and inherited handles fail closed.
5. Add tests for invalid configuration, disabled behavior, normalized results,
   uncertainty/retry handling, provider identity and resource cleanup. Extend the
   deployment environment template, Compose forwarding and service check as needed.

No adapter selection branches need to be added to notification bootstrap. The
email registry returns `EmailSender`, so API-backed email adapters can be added
without inheriting the SMTP implementation. SMS and phone factories preserve the
existing explicit live-send authorization gate.

## Configuration and delivery safety

Email runtime and the read-only service probe share `smtp-settings.mjs` for
parsing, validation, authentication and TLS policy. This module is usable by plain
Node scripts and TypeScript application code. Its registry contains only SMTP
authentication definitions; future API email adapters supply their own settings
and probe without adopting SMTP options.

Secrets never become provider identities or service-check output. Existing
notification profiles, prepared content and delivery capabilities remain pinned;
changing a provider must not reroute an uncertain send. Restart the backend after
configuration changes and reconcile outstanding operations before switching.

Stripe implements `PaymentProvider` and normalizes wire responses into
`PaymentCheckoutSession` and `PaymentRefund`: original payment identifiers,
integer minor-unit amounts and payment states remain authoritative. The existing
Stripe workflows explicitly resolve `stripe` and reject injected replacement
providers before side effects. Stripe-specific inboxes, signature verification,
currency rules and original-source refund checks remain in place. A second online
payment provider also needs its own verified webhook/settlement integration;
registering its transport alone does not enable it for existing Stripe purchases.

Registries do not automatically fall back to another provider. A timeout can hide
an accepted send or payment, so failover must not create a duplicate effect.

## Validation

On 2026-10-09, 707 unit/storefront-library tests, 93 isolated PostgreSQL
integration tests and all 10 two-service production browser tests passed.
TypeScript, lint and both production builds passed. Tests include non-SMTP email
extension, adapter-owned profile fencing, unknown/prototype handle rejection,
OAuth/TLS configuration, canonical payment results and rejection of replacement
providers before checkout, webhook-inbox or refund side effects. No live provider
credentials or customer messages were used for these checks.

# Notification integration structure

Implemented 2026-10-06. Live SMS and phone-verification sending remain disabled;
tests use injected fakes and local SMTP. No production provider request was made.

## Ownership and dependency direction

`src/application/ports/notifications.ts` defines `EmailSender`, `SmsSender`,
`PhoneVerifier`, transport outcomes and normalized delivery events. Application
workflows use these contracts and never import provider SDKs or response types.

`src/application/notifications` owns content rendering, consent/quiet-hour policy,
retry decisions, durable delivery processing and callback reconciliation.
`src/infrastructure/notifications` implements Nodemailer, Telnyx and explicit test
fakes. The bootstrap validates configuration and constructs a process-wide
registry shared across Next.js entrypoint bundles. There is no implicit fake
success when a channel is unconfigured. The old SMTP interface is a small
compatibility shim for existing authentication hooks, backed by the same registry.

## Delivery facts and retries

- `accepted` means transport/provider acceptance, not confirmed delivery. SMTP
  remains accepted because it has no delivery webhook here. Historical email
  successes migrate to unconfirmed acceptance without resending.
- Tracking-capable SMS starts `awaiting`; verified callbacks can produce `sent`,
  `delivered` or `failed`. Terminal delivery evidence cannot regress because an
  older callback arrives later.
- A definite retryable rejection uses bounded retries and provider delay hints.
  Permanent rejection is failed. An uncertain submission enters review unless
  the adapter explicitly declares a supported idempotency window; neither current
  SMTP nor Telnyx SMS makes that guarantee.
- Provider/profile, capabilities and prepared content are pinned before I/O.
  Configuration changes never silently reroute an uncertain message. Immutable
  attempt/result records retain both lease expiry and late provider results.
- Messages are claimed immediately before their individual send. Provider I/O
  stays outside transactions. Fenced acknowledgments prevent stale workers from
  overwriting reclaimed work. Expired attempts recover even if their channel is
  subsequently disabled.

SMTP uses one reusable pool, eight pending operations maximum and a 30-second
overall deadline. A deadline closes that generation and records uncertainty.
After a 30-second cooldown, new logical messages can create a fresh pool; the
original message is never internally replayed. Shutdown drains tracked work for
35 seconds and closes pools; backend Compose provides a 45-second stop grace.

## Webhooks and verification

`POST /api/notifications/telnyx` verifies Ed25519 over the timestamp and raw bytes,
bounds the body, and acknowledges only after the event is durably persisted.
Duplicates are deduplicated by provider/profile/event ID. Early or unmatched
callbacks remain available for reconciliation after provider message IDs commit.
Unknown signed event types are retained rather than silently discarded. The
retired Twilio callback returns 410 and performs no mutation.

Phone verification pins provider/profile and a nonce before external I/O. Opt-out
or a phone change invalidates pending approvals. Old verification IDs cannot be
submitted to a newly selected profile. Per-customer database limits bound starts
and code checks. START callbacks never restore consent; fresh verified consent is
required. STOP suppresses pending sends without erasing already accepted facts.

## Backend configuration

| Setting | Meaning |
| --- | --- |
| `EMAIL_PROVIDER` | `nodemailer` or `disabled`; inferred from SMTP host when absent |
| `SMTP_HOST/PORT/FROM` | Selected SMTP endpoint and sender |
| `SMTP_USER/PASSWORD` | Optional authentication, kept private to the adapter |
| `SMTP_SECURE` | Optional implicit TLS override; port 465 defaults secure |
| `SMTP_REQUIRE_TLS` | Optional STARTTLS override; required by default off-loopback |
| `SMS_PROVIDER` | `telnyx` or `disabled`, default disabled |
| `PHONE_VERIFICATION_PROVIDER` | `telnyx` or `disabled`, default disabled |
| `TELNYX_API_KEY` | Backend-only credential |
| `TELNYX_FROM/MESSAGING_PROFILE_ID` | SMS sender and messaging profile |
| `TELNYX_VERIFY_PROFILE_ID` | Verification profile; optional `_ZH` profile for Chinese |
| `TELNYX_PUBLIC_KEY` | Signature validation for callbacks |
| `DISABLE_OUTBOUND_DELIVERY` | Global suspension; no transport construction/sending |

Selected configuration fails fast if invalid. Provider identity uses nonsecret
endpoint/sender/profile fields; credential rotation preserves that identity.
Restart the backend when changing configuration. Live SMS authorization remains
off in the composition root independently of selected provider configuration.

## Adding another provider

Implement the appropriate application port, translate its errors into definite
rejection or uncertainty, and declare only documented capabilities. Add typed
configuration and one factory branch. If it supports callbacks, verify them in
an infrastructure handler and emit normalized events through the durable inbox.
Add the same acceptance, rejection, timeout, profile and webhook contract tests.
Order/reward/inventory workflows and templates require no provider-specific edits.

Migrations 0033–0034 add delivery history, durable inbox and verification fencing.
Validate with `pnpm test`, `pnpm test:integration`, and the production browser
mail fixture. Nodemailer and Telnyx API behavior was checked against their
[pooling documentation](https://nodemailer.com/smtp/pooled) and
[Telnyx developer documentation](https://developers.telnyx.com/docs/messaging/messages).

## Verification evidence

- Both application TypeScript checks passed.
- Full unit/lifecycle/storefront library suite: 619 tests across 71 files passed.
- PostgreSQL suite: 83 tests across 11 files passed, including callback races,
  disabled-channel recovery, sticky uncertainty and forward-upgrade semantics.
- Seven production browser journeys passed through local SMTP, including
  signup/verification, password reset and store-email proof redemption.
- Independent review found no remaining critical/high issues. A permanent SMTP
  timeout circuit identified during review was replaced with bounded recovery.
- Standalone container/migration validation is recorded after the final gate;
  the earlier generic-store sustained load evidence is unchanged.

These checks used local SMTP and fake Telnyx clients. Provider activation,
delivery to real recipients and live SMS authorization are separate operations.

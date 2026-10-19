# Merchant policies and SMS consent

Supastore supplies shared policy pages, disclosure text and opt-in controls.
Each store publishes its own reviewed content and registers its own brand and
campaign with its messaging provider. No merchant identity is hard-coded.

## Configure a store

1. Set the business name, support email and default language in store settings.
2. Open `/admin/settings/content`. Complete Privacy Policy and Terms in the
   default language. Optional English starters include SMS language; fill every
   bracketed section and review the actual business practices before saving.
   Translations fall back to the default store language.
3. Open `/admin/settings/sms`, review disclosures and policies, then enable
   opt-in. Missing identity, policies, unresolved placeholders or missing review
   prevent enablement. Changing policies, business name, support email or default
   language requires another review and enablement.
4. Check `/privacy`, `/terms` and `/sms` on the merchant's public domain. They
   redirect to the default-language pages. Canonical policy URLs are
   `/{locale}/pages/privacy` and `/{locale}/pages/terms`; the public opt-in is
   `/{locale}/sms`. Enabled stores also show the opt-in on the final checkout step.

## Enable the deployment

SMS and verification are off by default. Set backend `SMS_PROVIDER=telnyx`,
`PHONE_VERIFICATION_PROVIDER=telnyx`, the documented Telnyx credentials/profiles,
and explicitly set `SMS_LIVE_AUTHORIZED=true` when authorized to send live
messages. Restart the backend after configuration changes.
`DISABLE_OUTBOUND_DELIVERY=true` overrides authorization. Merchant readiness
and both providers are required for enrollment. Until transport is available,
the form explains that enrollment is unavailable; purchasing still works.

Apply migration `0042_sms_consent` before deploying these application changes.
It preserves existing account preferences and introduces guest preferences,
versioned consent snapshots, event history and an optional order association.
Legacy preferences without a captured disclosure must opt in again before
delivery. Back up the deployment before migrating.

## Customer behavior and evidence

The phone field and SMS checkbox are optional at checkout. The checkbox starts
unchecked, is separate from order acceptance, names the merchant and order-update
purpose, and displays frequency, rates, STOP/HELP, no-purchase-condition and
no-marketing-sharing disclosures alongside policy links.

Checking a box alone does not send order updates. The customer explicitly
requests a verification code and confirms it. Requests are bounded by destination
and customer, confirmations are bounded and expire, and claims are pinned to the
verification provider/profile. Consent records include phone, timestamp, source,
accepted wording and version. Requested, verified and withdrawn records remain
in history after STOP or account withdrawal. Owners can see the latest 50 events
at `/admin/settings/sms`.

A verified checkout selection attaches that subscription to the order, including
guest orders. Leaving the checkbox unchecked creates an order without that
association. Standalone signup records consent for the program; customers select
and verify SMS at checkout to associate an order. It does not attach old orders
by matching an unverified contact phone number.

The worker checks merchant readiness, current disclosure, verified phone and
active consent before claiming and immediately before sending. STOP invalidates
pending verification and suppresses queued messages; a subsequent web opt-in
requires a new affirmative consent and verification. Previously accepted
transport outcomes remain in the delivery history.

## Telnyx campaign registration

Deploy the actual merchant content first. Submit the specific public opt-in URL
and a screenshot showing the phone field, unchecked checkbox, full text and
working links. Describe the actual code-verification step and checkout order
association. Do not claim that providing a contact number implies consent.
A generic demo storefront or a reseller policy does not replace merchant evidence.

The SMS settings page generates brand-specific START, STOP and HELP response
text. Copy it into the Telnyx campaign/profile configuration. Supastore does not
write that configuration or send duplicate keyword replies. START includes
message rates and the no-purchase-condition disclosure. Provider keyword behavior
and application re-enrollment must be reflected accurately in the campaign flow.

References: [opt-in forms](https://support.telnyx.com/en/articles/10684260-10dlc-opt-in-form),
[privacy policies](https://support.telnyx.com/en/articles/10645583-10dlc-privacy-policy),
[keyword responses](https://support.telnyx.com/en/articles/10645338-10dlc-keywords-and-confirmation-messages).

## Validation

Validated on 2026-10-19 with synthetic data and fake messaging providers:
the full unit/storefront-library suite, all three TypeScript projects and ESLint
passed. Fifty SMS verification, guest checkout and notification coordination
integration tests passed on isolated PostgreSQL databases. Shared SMS policy
logic reached 100% statement coverage and 96.15% branch coverage.

`tests/browser/sms-consent.spec.ts` covers policy publication, setup gating,
public links and purchasing without SMS. The production browser runner could not
reach execution because the installed SWC native addon rejects this Windows
environment's cache-directory permissions (`ERR_SWC_NATIVE_CACHE`). Re-run
`node scripts/test-storefront.mjs tests/browser/sms-consent.spec.ts` in a working
build environment before release. No live merchant deployment or real SMS
delivery was performed.

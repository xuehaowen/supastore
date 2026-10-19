# Generic store follow-up operations

## Rewards

Open `/admin/settings/commerce`. Enable rewards, set the rate in basis points
(500 = 5%), optional eligible categories and UTC activation start/end. An empty
category selection permits every category; product exclusions still win. Start
is inclusive and end is exclusive. Accepted order policy/funding is immutable.

Funding corrections can suspend reward release. On the order page, use the
owner-only funding-review action after repairing the original verified receipt
history. Supply a reason and unique request identity. Resolution validates the
original frozen sources and preserves holds/debt recovery. It cannot replace a
missing source with unrelated money. Repeating the same request is idempotent.

## Shipments and bookings

Open `/admin/fulfillment/shipments` and choose an order. Dispatch selected item
quantities with a unique request key, carrier and tracking number. Stock is
consumed per unit once. Record each shipment delivered; the order completes and
rewards release only after all ordered quantities are delivered. Pickup remains
subject to verified handoff.

For an undispatched pickup/local-delivery order, choose another slot in the same
location/service area or provision an available date/window. Rescheduling locks
source/destination and validates destination capacity/quota in one transaction;
failure preserves the original booking.

## Trusted carrier callback contract

Backend `CARRIER_WEBHOOK_PROVIDER` and `CARRIER_WEBHOOK_SECRET` enable
`POST /api/webhooks/carrier`; leave both blank to retain manual delivery records.
This is a gateway contract, not an assertion that every carrier's native webhook
format is supported. A trusted merchant integration maps carrier delivery proof
to JSON containing `eventId`, `shipmentId` and `status: "delivered"`.

Set `x-carrier-timestamp` to Unix seconds and `x-carrier-signature` to the hex
HMAC-SHA256 of `timestamp + "." + raw JSON body` using the configured secret.
Timestamps must be within five minutes. Provider/event identities deduplicate
retries and reject changed payloads; a callback cannot complete undispatched
units. Secrets stay on the backend/integration, never in the browser.

## External release checks

Stripe uses provider-native minor units. Configure USD/CNY with precision 2,
JPY with precision 0, and ISK/UGX with precision 2 and whole-unit amounts
(multiples of 100 internally). Checkout and refunds reject incompatible or
unverified currency units instead of converting or rounding. The initial
adapter supports the currencies listed in `apps/backend/src/domain/stripe-currency.ts`;
other currencies retain manual payment support until their provider units are
verified. Account availability and provider minimum amounts still require live
acceptance. See [Stripe's currency rules](https://docs.stripe.com/currencies).

For production ingress, configure a random `EDGE_PROXY_SECRET` of at least 32
bytes in the storefront and trusted HTTPS edge. The edge must overwrite
`X-Supastore-Edge-Token` with that secret and `X-Supastore-Client-IP` with the
actual single client address, never append or reuse browser values. The
storefront validates the token and IP, removes these private headers, and
forwards only the authenticated IP to backend rate limiting. Keep direct
backend access private. The secret must never use a `NEXT_PUBLIC_` variable,
enter browser code or appear in access logs. Blank configuration rejects all
forwarded IPs; authentication may then share one per-route rate-limit bucket.

Run `node scripts/check-release-services.mjs --connect` to verify Stripe account
and SMTP connectivity without creating payments or messages. Local Stripe
credentials are absent and the SMTP probe failed. Supply the deployment target,
fix credentials and designate test recipients before live acceptance.

SMS sending defaults off. Merchant policies, consent readiness, provider
configuration and explicit deployment authorization are described in
[merchant SMS consent](sms-consent.md). Reward-detail emails remain disabled.
Order and credit operations continue through the authenticated storefront.

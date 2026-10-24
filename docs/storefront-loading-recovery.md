# Storefront loading and checkout recovery

Shopping links use Next.js link pending state to show localized catalog, product
or checkout skeletons. The previous page stays mounted while hidden, so link
pending state can complete normally. A status message announces loading and pulse
animation is enabled only when the customer has not requested reduced motion.
Ordinary server requests and no-JavaScript catalog forms remain unchanged; there
are no route loading boundaries that strand streamed content behind scripts.

Checkout fulfillment details and promotion codes can be restored in the same
browser tab for 30 minutes. Drafts are scoped to cart and customer, use
`sessionStorage`, and offer an explicit clear action. Reviewed quote defaults
take precedence. Payment selections, credit, terms acceptance and scheduled
pickup/delivery times are excluded. Current fulfillment options and server-side
validation still determine what the customer can order.

On successful order creation, a one-time browser token clears only the matching
draft. Its URL marker is removed after consumption. Older confirmation links do
not erase another draft or edits saved after placement. Browser storage failures
do not prevent checkout.

Validation includes pure draft expiry/allowlist/isolation tests, localized loading
markup checks, and browser tests for refresh/browse recovery, clearing, expiry,
pending product navigation and successful placement. Existing shopping and
no-JavaScript sorting journeys are also checked.

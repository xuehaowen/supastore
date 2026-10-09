# Storefront customer review — 2026-10-08

Reviewed the main storefront at localhost:3100 using the existing isolated synthetic database harness, desktop browser, and a 390 × 844 mobile viewport. No production orders or payments were used. Application code was not changed. The separate apps/storefront implementation was inspected in source but was not run; findings below concern src/app unless stated otherwise.

## Findings

### P1: Guest checkout defaults to an unusable payment choice
The paid $32 shirt cart defaults to “Store credit in full or free order.” A guest can obtain a $37 shipping quote and reach order review without selecting a usable payment method. create-order.ts rejects a positive remaining balance when the quote contains neither a manual method nor a configured online payment option. The failure is delayed until order submission. Reproduced the default and review screen in-browser; rejection verified in source. Default to an active payment method, or require a deliberate choice and prevent review when a guest cannot cover the balance.
References: src/app/[locale]/checkout/page.tsx payment selector; src/application/use-cases/create-order.ts:134.

### P2: Editing fulfillment discards customer input
Entered a complete shipping address, reached review, then selected “Edit fulfillment.” The shipping address was blank again. The link drops the quote identifier and CheckoutFields initializes address to an empty string. Error redirects similarly reconstruct the first step without the entered values; place-order failures also drop the quote. Preserve the checkout draft and reopen the existing fulfillment selections for editing.
References: src/app/[locale]/checkout/page.tsx:119; src/app/checkout-fields.tsx:251; src/app/actions.ts:142 and 180.

### P2: Chinese checkout remains substantially English
Verified /zh/checkout: shipping and pickup choices, address labels, promotion field, calendar instructions, checkout card heading, bag heading, and subtotal remain English. The header also says “Sign in.” CheckoutFields has no locale/messages prop; CheckoutCredit also hardcodes English. Translate the full customer journey, including errors and payment instructions.
References: src/app/checkout-fields.tsx:258; src/app/[locale]/checkout/page.tsx:246; src/app/checkout-credit.tsx; src/app/[locale]/layout.tsx:89.

### P2: Radio input styling squeezes checkout labels
Desktop and mobile screenshots show shipping/pickup circles centered within a large input area, with labels pushed to the far right. Pickup addresses wrap into a narrow column. The shared Input component applies w-full and h-8 to radio inputs; .check does not constrain their width. Use explicit small fixed-size radio controls and keep labels beside them.
References: src/components/ui/input.tsx:11; src/app/checkout-fields.tsx:266; src/app/globals.css:309.

### P2: Switching variants retains a quantity above the new stock limit
Source-confirmed edge case: select a variant with stock 10, raise quantity to 10, then choose a variant with stock 2. Variant handlers update variantId only. maxQty becomes 2, but displayed/submitted quantity remains 10 and Add to bag remains enabled. Clamp quantity when changing variants and validate the selection before submission. This case was not reproduced with a tracked-stock fixture during this review.
References: src/app/product-purchase.tsx:62,192,221,255.

## Validation notes
Manual browser review confirmed catalog, product selection, adding to bag, shipping quote, editing fulfillment, Chinese checkout, and mobile pickup controls. Existing automated customer/order tests were also run; see the final chat response for the completed result. The thumbnail test failed before testing customer image rendering because its admin upload-status locator was absent. The merchant edit test failed on an absent unsaved-status locator. The cart test attempted to fill a hidden quantity input after the UI changed to plus/minus controls. These failures are verification gaps, not proof that those customer functions are broken.


Completed automated result: 17 passed, 3 failed (20 tests, approximately 5 minutes). Command: node scripts/test-browser.mjs tests/browser/catalog-polish.spec.ts tests/browser/cuj.spec.ts. The three failures are described above. This was a development-mode synthetic run, not a production performance or live-payment audit.

## Fixes applied

The five findings above are resolved in the main storefront:

- Paid guest carts default to an active manual method or configured online card payment. Review rejects an unpaid positive balance when neither payment nor sufficient verified store credit is available. Free orders and credit-funded purchases remain supported.
- “Edit fulfillment” restores the owning guest’s saved quote. Checkout validation returns errors on the current step, retaining address, promotion, payment choice, pickup location/date/time, name, email, and credit input. Native form resets are prevented because React action error returns otherwise reset select fields.
- Chinese checkout headings, fields, pickup calendar, credit controls, error notices, and account navigation are translated. Calendar months/dates use the selected locale.
- Shipping/pickup radios use small native controls with adjacent labels. Verified at 390 × 844; screenshot: storefront-checkout-mobile-fixed.jpg.
- Variant selection clamps quantity to the new variant’s stock limit, and displayed/submitted quantity also respects current stock limits.

Validation: 615 fast tests passed, TypeScript passed, canonical npm lint passed, and changed-file formatting passed. Production compilation succeeded. Next’s embedded lint step reported a dependency-resolution warning for eslint-plugin-react-hooks; the standalone repository lint command passed. During the development browser run, 19 of 21 journeys passed; the two failed older journeys both passed on a production rerun. Focused final production results are recorded below.

Independent correctness and UI reviews found a pickup-time retention edge case, which was fixed and covered by a regression test. No production data, payments, deployment, or application database was used. Changes remain in the working tree.

Final production verification: all 7 selected browser journeys passed, including all 5 storefront regression tests and the 2 previously failing older journeys. The final submission handler captures FormData and dispatches the action inside a transition, preserving native validation while avoiding automatic form reset. Final independent review found no remaining actionable issues within the reviewed changes.

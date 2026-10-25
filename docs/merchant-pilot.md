# Human merchant pilot

Status: **prepared; awaiting a human participant**. This is an observation script
and results sheet, not completed acceptance. Use it alongside
[production acceptance](launch-acceptance.md) and [merchant operations](merchant-operations.md).

## Prepare the session

Use an isolated synthetic store for usability work. The facilitator prepares
test customer/contact details, a product with at least three tracked units,
an agreed price, fulfillment method and synthetic payment evidence. Label all
simulated receipts/payouts as synthetic in the fixture. No real payment or email
is required for this usability pilot; actual provider acceptance belongs to the
separate, explicitly scoped production exercise.

The participant must be a person who will operate the store. Use their normal
phone/browser and preferred supported language; also check the customer flow on
mobile. Keep the completed participant/deployment record private.

Record participant role, observer, date, device/browser, language, release and
fixture identity before starting. Confirm the store is disposable and delivery
is suppressed or routed only to a local sink. Prepare backup/recovery so a
failed task does not lead to ad hoc database repairs.

## Facilitation

Read each goal without teaching the UI's clicks. Let the participant describe
what they expect and decide what to do. Record task duration, wrong turns,
error messages, assistance and the resulting business state. Give assistance
when necessary, but mark the task **assisted**. An observer or agent doing the
task is not evidence that a merchant completed it independently.

Stop a task if the outcome is uncertain; inspect the existing record before
allowing another order, receipt or refund. Retain sanitized request IDs for
failures. Do not silently repair data to keep the session moving.

## Task script and results

| Task read to participant                                                                   | Observer verifies                                                                                   | Result/time/evidence |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------- |
| Set up your store's profile, currency, fulfillment and payment instructions                | Settings persist; participant understands remaining readiness items; currency chosen before orders  | Not run              |
| Add a product, image, option/variant, price and stock, then make it available to customers | Correct published product and sellable quantity; no unintended variant changes                      | Not run              |
| As a customer on a phone, find the product, edit the bag and place an order                | Agreed total/fulfillment accepted, private tracking available, one order created                    | Not run              |
| Find that order as the merchant and decide what payment evidence proves                    | Merchant locates the right order and does not treat an image as verified receipt                    | Not run              |
| Record the facilitator's synthetic receipt and confirm the order                           | Correct amount/account, no duplicate receipt, confirmation prerequisites understood                 | Not run              |
| Prepare the order, print/view its packing slip and complete the chosen handoff             | Correct order contents, readiness/shipment state and stock movement                                 | Not run              |
| Handle the agreed refund or return scenario                                                | Authorization, goods handling and payout settlement distinguished; remaining entitlement reconciles | Not run              |
| Find the order and its financial outcome again                                             | Merchant can explain receipt, refund and balance using reports/history                              | Not run              |
| Sign out and confirm the workspace is private                                              | Private pages require sign-in; customer access does not grant staff access                          | Not run              |
| Recover from a failed upload or interrupted submission supplied by the facilitator         | Visible recovery path understood; no duplicate order/payment created                                | Not run              |

Use **unassisted**, **assisted**, **failed** or **not applicable** with a reason.
Record any data repair as a failure requiring investigation. If the store has
both shipping and pickup, repeat the customer/fulfillment tasks for both. If
both English and Chinese are offered to its customers, sample both flows.

## Debrief and completion

Ask which step was unclear, what the participant feared might happen, what
information was missing, and whether they could repeat the daily workflow alone.
Record their words and concrete task evidence; do not infer satisfaction from
an automated pass.

| Finding                      | Impact and task | Owner/fix | Retest result |
| ---------------------------- | --------------- | --------- | ------------- |
| No observations recorded yet | Pending session | Pending   | Not run       |

Completion requires an observed human session, business states matching the
tasks, no blocking ordinary-task failure, and retests for corrections. Record
remaining assisted tasks and the merchant/operator's dated acceptance decision.
Only then close the roadmap's merchant-pilot item. Production provider and
recovery gates remain separately owned by the launch worksheet.

# Production acceptance worksheet

Status: **not run against a production target**. Use this worksheet with the
[operator cookbook](operator-cookbook.md), [deployment guide](two-service-deployment.md)
and [merchant pilot](merchant-pilot.md). Local synthetic results are recorded
separately in [installation and storage evidence](installation-storage-acceptance-2026-10-19.md).

Keep the completed deployment-specific copy private. Repository examples must
not contain merchant domains, customer details, credentials or payment records.
For each result retain a date, responsible operator, pass/fail, sanitized evidence
reference and unresolved issue. A blank or skipped result is not a pass.

## Required inputs

| Input                   | Record in the private copy                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Target                  | Public HTTPS origin and execution host/SSH alias                                                |
| Release                 | Backend/storefront image tags or digests, migration revision                                    |
| Store                   | Intended merchant instance and isolated acceptance configuration                                |
| Operators               | Deployment operator, merchant participant and observer                                          |
| Providers               | Manual payment/Stripe modes, approved email recipient and storage origin                        |
| Live test authorization | Specific payer/payee, transaction purpose, spending limit, refund scope and approved recipients |
| Recovery                | Matching DB/assets backup, isolated recovery target, downtime window, RPO/RTO targets           |

Do not substitute an arbitrary accessible host or configured recipient when an
input is missing. Run local synthetic checks while the target and live operations
are being selected. Do not put real transfers through a synthetic rehearsal.

## 1. Release and HTTPS ingress

1. Confirm the target, versioned images and migration revision match the release
   being accepted. Follow the cookbook's explicit migration/start sequence.
2. Open the actual public HTTPS storefront with a normally trusted browser.
   Require a valid hostname/certificate chain and no certificate bypass or mixed
   content. Verify the HTTP origin redirects to the intended HTTPS origin.
3. Open `/en`, `/zh`, a product page, `/admin/login` and the sitemap. Confirm
   assets, language navigation, canonical URLs and sitemap links use the public
   origin and do not expose container hostnames.
4. Sign in and inspect session cookies: Secure and HttpOnly, expected SameSite
   and path. Verify sign-out removes private access, customer sessions do not
   establish staff access, and invalid recovery links remain on the public host.
5. Verify the edge overwrites client-IP/token headers and rejects spoofed
   forwarding. Confirm backend, PostgreSQL, storage admin and database tools are
   not publicly exposed. Browser storage access needs its separately intended
   reachable endpoint and CORS configuration.
6. Check `/api/health/live`, `/api/health/ready` and worker health. A database
   readiness response does not prove provider delivery or storage access.
7. Follow [security deployment](security-deployment.md): enroll every active staff
   account in authenticator MFA, store recovery codes privately, and verify zero
   unenrolled accounts using its read-only query. Test second-factor sign-in and
   confirm rate limits survive a backend restart through the trusted edge.

**Pass evidence:** HTTPS/browser observations, selected image revisions, cookie
attributes, private-service exposure checks and sanitized health results.

## 2. Controlled sale, delivery and refund

Use the chosen store, approved recipient/payer and bounded transaction amount.
Keep receipts and provider identifiers in the private evidence record.

| Check                      | Required result                                                                                                                | Status  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Checkout                   | Accepted total/currency/fulfillment match the agreed purchase; retry does not duplicate it                                     | Not run |
| Manual payment, if enabled | Verify actual receipt and receiving account before recording it; evidence upload alone never confirms payment                  | Not run |
| Stripe, if enabled         | Signed callback/provider retrieval establishes payment exactly once; browser redirect alone cannot confirm it                  | Not run |
| Email                      | Approved recipient confirms actual inbox receipt and correct public links; provider acceptance alone is insufficient           | Not run |
| Storage                    | Public catalog image renders; private evidence is accessible only with scoped authorization; unsigned private access is denied | Not run |
| Fulfillment                | Merchant records the intended pickup/shipment and completion, with the correct stock movement                                  | Not run |
| Refund                     | Owner authorizes the agreed amount, provider/manual payout is verified, and reconciliation/report totals match                 | Not run |
| Financial review           | No unexplained receipt, credit, stock, payout or provider discrepancy remains                                                  | Not run |

For an unavailable/rejected provider, record the failure, request ID and retry
decision. Inspect existing payment/order state before retrying an uncertain
operation. Unsupported or unused payment methods may be marked **not applicable**
with the store configuration and reason; do not mark them passed.

## 3. Target-host recovery drill

1. Select matching database and object-storage snapshots from the intended host.
   Record backup time, release versions and snapshot inventory/checksums.
2. Restore to an isolated target using the [recovery playbook](playbooks/disaster-recovery.md).
   Stop target clients, set cold-restore confirmation, and enforce delivery
   suppression/disabled workers in the actual service environment.
3. Verify schema/revision, representative orders, receipts, refunds, balances,
   stock, audit history and immutable/private assets. Check unsigned private
   access is still denied.
4. Reconcile uncertain provider/outbox operations before enabling delivery.
   Do not resend old messages or recreate physical payments to make a drill pass.
5. Record elapsed recovery time and actual restored data age against the chosen
   RTO/RPO. Document any mismatch or missing asset. Keep the restored instance
   isolated until the operator authorizes its final disposition.

**Pass evidence:** verified snapshots, restore/health results, business/asset
checks, measured RTO/RPO and reconciliation decisions. A local fixture restore
does not satisfy this target-host gate.

## 4. Merchant pilot and release decision

Run the [human pilot script](merchant-pilot.md). Require the actual participant's
observations, not an agent-completed simulation. Resolve blocking failures and
repeat affected tasks. The operator and merchant then record a dated decision:

- Target/release and evidence references: pending.
- HTTPS/private-service checks: pending.
- Selected payment, email, storage and refund acceptance: pending.
- Target-host backup/recovery acceptance: pending.
- Human pilot and unresolved issues: pending.
- Release decision and responsible owner: pending.

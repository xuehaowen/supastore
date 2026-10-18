# Milky Bakery selling readiness

Updated October 17, 2026 (America/Los_Angeles). Work follows the owner's selling-first priority: usability, fixed storefront design and reliability before performance optimization. This record distinguishes completed local development from store-owner and deployment acceptance.

The owner's working launch direction is now two independent instances—pickup-only and shipping-only—with manual payment on both. [The two-instance recipe](milky-bakery-two-instances.md) records configuration, data separation and both passing mobile sales rehearsals. Latest acceptance is 1,181 unit/library and 45 default browser tests; earlier dated results below remain part of the evidence trail.

## Usability findings and changes

| Observed issue                                                                                 | Delivered behavior                                                                                                                                             | Verification                                             |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Launch checklist describes missing configuration without a direct next action                  | Owner overview and setup recommend one action with an existing settings/product link, ordered profile → products → fulfillment → payment/templates/email       | Helper/render regressions and owner browser journey      |
| Manually enabled variants with zero sellable stock can be selected and offered for add-to-cart | Initial selection skips sold-out variants; option/radio selection and submit controls respect tracked stock; server inventory validation remains authoritative | Render regressions and live stock browser journey        |
| Product structured data can advertise zero-stock offers as in stock                            | Product offers use the same availability predicate as purchase controls                                                                                        | Render regression and browser JSON-LD assertion          |
| Mobile home uses a large abstract illustration and generic heading                             | Merchant name and existing localized public introduction lead the page; an existing catalog photo is featured when available; no-photo layout stays compact    | EN/ZH mobile/desktop screenshots and browser checks      |
| Cached catalog profile can disagree with the current header after a settings change            | Hero uses the request-scoped live layout profile while anonymous product listings retain their existing cache                                                  | Stale-profile reproducer and full browser acceptance     |
| Denied clipboard access silently fails during payment                                          | Visible localized fallback explains manual copying; both amount and reference can retry without placing another order                                          | Denied/retry browser cases verify the exact copied value |

No new database fields, theme editor, dependency, tracking SDK or transaction workflow was introduced. Owner-only setup authorization, financial calculations, inventory reservations, order idempotency and provider settlement rules remain in their existing application workflows.

## Store usability and design scope

Existing setup and daily-operation screens already provide product publishing, payment review, fulfillment, refunds, failed-email queues and settings persistence. This work improves the demonstrated gaps rather than replacing those screens. The production regression suite covers the existing workflows, including preserved checkout input, stale quotes, lost order responses, receipt correction, pickup readiness and refunds.

The fixed visual direction retains the current cream/green palette and serif typography, with a simpler merchant-led hero, real catalog photography when supplied, responsive spacing, visible keyboard focus and reduced-motion support. It adds no invented photography, marketing claims, address, hours or phone number. Product, cart and checkout retain the existing presentation and transaction controls; the responsive/accessibility audit checks their rendered states alongside the administrative screens.

The owner's **“keep location private”** decision still applies. No LocalBusiness/Bakery markup or public pickup address is added. Existing private operational instructions are not repurposed as marketing content.

## Reliability and recovery

- Checkout's existing lost-response recovery reconciles the original quote/order instead of creating another order. Existing stale-quote and paused-store journeys remain required.
- Owners can pause new orders from Overview while retaining existing order/payment/fulfillment access. The pause section now explains this behavior.
- Required email templates, verification and failed notifications retain their existing checks and queues. Configuration completion is explicitly distinct from an actual controlled order/payment and backup restore.
- Existing backup/restore guards refuse overwrite, incomplete/corrupt evidence and active restore targets; recovery suppresses outbound delivery. Their regression tests are included in unit acceptance. See [disaster recovery](playbooks/disaster-recovery.md) and [outbox reconciliation](playbooks/outbox-reconciliation.md).
- The earlier Docker-engine limitation is resolved. A [fresh Linux container rehearsal](reliability-acceptance-2026-10-17.md) passes current builds, migration upgrade, synthetic database restore and backend-outage recovery. The later real PostgreSQL shell rehearsal also passes custom/plain restores and overwrite, active-session and checksum guards after correcting Alpine checksum compatibility. A matching merchant database/assets backup still requires separate acceptance.

## Local acceptance record

RED/GREEN checkpoints are retained on `codex/platform-quality`: `9ffac71`/`0bf4fdd` for stock selection and guidance, `3e448dd`/`ad97953` for rendered setup and Product offers, `1b94803`/`0c1689b` for merchant design and copy recovery, and `c61e7af`/`8a9f6a9` for current branding and accurate fallback copy.

Final acceptance passes **1,171 unit/library tests, 143 PostgreSQL integration tests and all 49 production browser tests**. Both production builds, canonical root/backend/storefront types, repository ESLint and full formatting pass. Focused coverage of the new availability/guidance/checklist helpers is 100% statements/lines/functions and 93.75% branches. Independent review found no remaining confirmed issues after the copy-feedback correction.

The later [reliability follow-up](reliability-acceptance-2026-10-17.md) adds six recovery-deadline regressions: **1,177 unit/library tests now pass**, along with the fresh container recovery chain. The standard CI browser command now includes sales usability and the responsive audit and passes **43 tests**; the earlier extended 49-test selection additionally includes six legacy M1 tests. Existing integration evidence is retained because application transaction code did not change.

The final browser audit inspected **109 rendered screens covering 44 backend and 15 storefront page sources at 375/768/1440px**, with no serious/critical automated accessibility findings or horizontal-overflow failures. Representative product, populated checkout and setup screenshots were also visually inspected. Browser fixtures and integration PostgreSQL shut down cleanly.

All four route budgets pass unchanged policy: catalog/product/cart/checkout are **156.8/158.2/155.5/161.4 KiB gzip**. [Machine-readable bundle result](benchmarks/2026-10-17-selling-budgets.json). No standard load benchmark was rerun for this presentation work.

Initial broad acceptance exposed the branding defect above, a stock-test label mismatch and an aborted receipt-test navigation; a later attempt exposed a test using “Copy amount” instead of the existing “Copy exact amount” label. These failed attempts are not counted as passing evidence. The final clean 49-test run supersedes them. Automated checks do not replace owner approval, translation review or assistive-technology testing.

Reproduce local acceptance with the existing runners:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run test:unit
pnpm run test:storefront:unit
pnpm run test:integration
node scripts/test-storefront.mjs tests/browser/original-storefront-separation.spec.ts tests/browser/cuj.spec.ts tests/browser/i18n.spec.ts tests/browser/boundaries.spec.ts tests/browser/cross-service-sitemap.spec.ts tests/browser/sitemap.spec.ts tests/browser/cross-service-scale.spec.ts tests/browser/sales-usability.spec.ts tests/browser/ui-page-audit.spec.ts tests/browser/m1.spec.ts
pnpm run bench:storefront
```

The bundle command needs the production build directory; for an isolated build, set `STOREFRONT_DIST_DIR=.next-cuj/<fixture-id>`. Existing Windows runtime/temp requirements remain in [baseline evidence](platform-quality-baseline.md).

## Owner and deployment acceptance still required

The latest local service probe authenticated the configured OAuth2 SMTP connection without sending a message. This confirms local connectivity/authentication only; real transactional delivery and connectivity from KVM 2 remain unverified. The shell-recovery follow-up passes **1,183 unit/library tests**; earlier application/browser evidence remains separate.

1. **Real catalog and fixed storefront approval:** supply/review actual names, prices, stock, photographs, translations and public policies. Confirm the available theme at 375px and desktop. No real store data was changed by local fixtures.
2. **Configured selling path:** use the intended fulfillment and payment methods; check preparation/collection instructions and customer totals. Complete an authorized controlled order, actual payment, transactional email, fulfillment and refund in the designated environment. Fixture receipts are never production settlement evidence.
3. **KVM 2 cutover:** verify real DNS/HTTPS, cookies, trusted ingress, required providers, worker supervision and ordinary resource headroom. Inspect actual production sitemap/canonicals and private-page indexing exclusions.
4. **Recovery:** verify a matching database/assets backup, isolated restore with sends disabled, reconciliation, compatible-image rollback and pause/resume procedure. Do not roll back financial history to reverse real transfers.
5. **First sales cycle:** inspect failed notifications, unpaid/evidence-review orders, pickup/dispatch work and stock discrepancies. Keep a short owner friction log for the next small fix.

Performance optimization remains deferred. The PostgreSQL memory-accounting question and compact-runtime throughput tradeoff stay open in [memory diagnosis](memory-diagnosis.md), without changing thresholds or claiming a performance pass. Actual crashes, resource exhaustion or failed purchases remain selling blockers. No unrelated workflow refactor is justified by these presentation changes; Step 8 is skipped for this batch.

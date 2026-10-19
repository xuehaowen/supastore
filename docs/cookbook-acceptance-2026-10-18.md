# Cookbook rehearsal

Date: October 18, 2026, America/Los_Angeles. This is synthetic local acceptance,
not a human merchant pilot or production deployment.

## Environment and boundaries

The rehearsal used a separate Docker Compose project, disposable PostgreSQL 18
databases, real RustFS buckets and a local SMTP sink that cannot relay mail.
Loopback fixture ports were 25450 (database), 3103 (storefront), 9009 (storage)
and 9010/25259 (mail API/SMTP), instead of the cookbook's default local ports.
No configured merchant database or provider configuration was changed.

Existing workspace dependencies and the previously built storefront fixture
image were reused. The backend was rebuilt as a separately tagged Linux fixture
image after the redirect correction below. This does not establish a fresh
dependency install, native Windows development build, RustFS console UI procedure,
or deployment-host acceptance. Buckets were initialized through the S3 API.
Package commands were invoked through their underlying Node/tsx entry points;
the documented explicit Node demo-seed command was executed as written with
fixture environment values.

## First owner on an empty database

Verified that the migrated database had no users or store settings, then ran
`scripts/recover-owner.ts` with the synthetic owner email and local public origin.
The browser completed this sequence:

1. Redeem the CLI's single-use recovery URL and establish a staff session.
2. Open `/admin/setup`, supply the setup secret and create the store.
3. Request a password reset through `/en/account` and retrieve the link from
   the local SMTP sink.
4. Set a password, creating the credential account and revoking the previous
   staff session.
5. Sign in normally through `/admin/login`, verify persisted store settings,
   sign out and confirm private setup access redirects to sign-in.

All steps pass. No reusable password was assumed to exist after CLI provisioning.

## Demo setup on a separate database

Applied migrations and runtime-role grants, then executed the cookbook's explicit
Node seed command with the migration connection selected only in the child
process. Verified the seeded owner/catalog and absence of the first database's
owner. Switched only the fixture backend to the demo database with delivery
suppressed and its worker disabled.

Browser checks pass for the public storefront, documented synthetic owner
sign-in, catalog image upload/rendering, guest checkout and private evidence
upload/persistence. Database readiness succeeds and worker health confirms it is
disabled. RustFS initialization separately verifies signed private access and
anonymous denial. Real payment, live email delivery and refund settlement were
not performed.

The first image probe used a warmed anonymous catalog listing; the final check
uses an uncached search and explicitly selects a rendered image. Repeated probes
also required scoping the description field to the upload form, since existing
images have their own description fields. These are rehearsal-harness corrections;
the cookbook now explains catalog revalidation.

## Defect found and fixed

The original owner-recovery handler built success and error redirects from the
backend request URL. Behind the Docker proxy this exposed `http://0.0.0.0:3000`
and prevented the browser from completing login. Both redirects now use the
existing validated public-origin helper. Token and cookie behavior is unchanged.

The focused owner-recovery integration regression fails before the fix and all
three cases pass afterward. It checks internal-request/public-redirect behavior,
signed staff-cookie authentication, customer-realm separation, token expiry and
single-use redemption. The complete empty-store browser flow passes after the
fresh backend build. Review found no further issues with the correction.

## Verification and cleanup

- Owner-recovery integration: **3 passed**.
- Error suite: **78 passed**, with its coverage gate.
- Root/backend TypeScript, repository ESLint and formatting: pass.
- Command inventory: all **44** root package commands documented; local Markdown
  file targets and documented Node snippet syntax checked.
- Both fixture databases and storage were removed with the Compose project.
  Label-filtered container, volume and network inventories are empty.

Ignored rehearsal harnesses/logs/results remain under
`.tmp-cuj/cookbook-rehearsal/`; separately tagged images are retained. Earlier
[store-readiness results](store-readiness-follow-up-2026-10-18.md), including the
19-journey browser suite, remain separate evidence and were not rerun wholesale
for this narrow redirect change.

The [cookbook](operator-cookbook.md) and [command reference](commands.md) describe
the reproducible tasks. Production domain/TLS, real provider acceptance, target-host
backup recovery and the observed human merchant pilot remain separate release
work. This rehearsal did not repeat the backup/restore procedures; their earlier
[recovery evidence](reliability-acceptance-2026-10-17.md) remains separately dated.

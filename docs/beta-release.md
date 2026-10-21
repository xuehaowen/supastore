# Developer-beta release

The intended first release is a developer beta for evaluation and contribution.
It is not production certification or a promise of Medusa-compatible APIs or
plugins. Stable production support is not offered yet.

## Release prerequisites

- Merge the reviewed candidate into the default branch and require passing CI
  on the exact commit. Local results do not replace this check.
- Verify private vulnerability reporting remains enabled and the repository
  owner/maintainers can receive notifications. See [security policy](../SECURITY.md).
- Rehearse the documented demo from a fresh checkout; record the revision,
  commands, tool versions and any remaining limits.
- Review the changelog, MIT license, contribution templates and public docs.
  Scan the release tree for credentials and merchant/customer data.
- Identify supported architecture/platforms. The initial publishing workflow
  builds Linux amd64 images; other platforms are not implied.
- State that [production acceptance](launch-acceptance.md) and the
  [human merchant pilot](merchant-pilot.md) remain open. Do not close those gates
  based on synthetic tests.

## Publish a beta

1. Select the accepted commit on the default branch and create a beta tag such
   as `v0.1.0-beta.1`. Tag creation is a maintainer release decision.
2. Run the **Publish developer beta** workflow with that existing tag. It checks
   default-branch ancestry and successful CI for that exact commit before publishing.
3. The workflow builds and publishes three GHCR images using the same version:
   `ghcr.io/xuehaowen/supastore-backend:TAG`,
   `ghcr.io/xuehaowen/supastore-storefront:TAG`, and
   `ghcr.io/xuehaowen/supastore-migrations:TAG`.
4. After every image succeeds, the workflow creates a GitHub prerelease with
   the tagged changelog and a digest manifest. A partially failed workflow does
   not establish a completed release. No `latest` tag is published.
5. Verify package visibility and anonymous pulls before advertising public images.
   New GHCR packages may require their visibility to be set to public.

The workflow does not deploy a store, apply migrations to a merchant database or
run real transactions. Its token needs package publishing and release-creation
permissions; no registry password is stored in the repository.

## Upgrade or roll back

Keep a deployment-specific record of all three image digests, migration revision,
database/assets backup and public-origin settings. Use `BACKEND_IMAGE`,
`STOREFRONT_IMAGE` and `MIGRATION_IMAGE` in the instance environment. Follow the
[cookbook upgrade procedure](operator-cookbook.md#deploy-or-upgrade-with-compose).

Before migrations, back up and rehearse on an isolated copy. Rolling back an
application image does not reverse schema changes; compatibility must be checked.
A database restore must use matching assets and the
[recovery playbook](playbooks/disaster-recovery.md), with outbound delivery suppressed.

## Local preparation evidence — 2026-10-20

The working tree based on `ce328cd` was checked on Windows with Node 24.12.0,
Docker Engine 29.7.2 and Compose 5.5.1:

- `node scripts/demo.mjs` built all four demo targets, applied migrations,
  provisioned storage and seeded three synthetic products. Backend, storefront
  and PostgreSQL health checks passed; storage provisioning succeeded. A headless Chromium check loaded the catalog and
  signed into the admin as the synthetic owner; README screenshots show that run.
- Repeating setup preserved the owner login and three-product catalog. The demo
  was then stopped with `node scripts/demo.mjs down`, retaining volumes/settings.
- Unit/storefront suites: 1,295 tests passed across 159 files.
- `node scripts/test-integration.mjs`: 171 tests passed across 22 files using
  its isolated database and fixed localhost notification origins.
- Root, backend and storefront TypeScript checks, ESLint and repository-wide
  Prettier checks passed. The release/demo changes received independent review.
- GitHub private vulnerability reporting was enabled and verified through its API.

These initial checks used the existing workspace. The clean-clone rehearsal below
adds installation evidence; neither result establishes hosted CI, a published
release, provider acceptance or an observed human pilot. The publishing workflow
has not been run and no beta images or tag were published as part of this
preparation. Repeat the release prerequisites on the merged commit.

## Clean-clone rehearsal — 2026-10-20

Candidate `666104b` was cloned locally with `git clone --no-local --single-branch`.
The clone had no `node_modules`, root `.env` or existing demo settings. A newly
created Docker container builder (`supastore-beta-fresh-20261020`, with
`default-load=true`) was selected through `BUILDX_BUILDER`; it had no prior build
cache. The frozen install downloaded all 678 packages with zero package reuse.

- `node scripts/demo.mjs` exited successfully after building all four targets,
  creating new, separately named volumes, migrating, provisioning storage and
  seeding the three products. Application and PostgreSQL health checks passed.
- `node scripts/test-demo.mjs` passed readiness, storefront/API catalog,
  anonymous admin denial, synthetic owner login/staff access and sign-out checks.
  No host dependency installation or root environment file was needed.
- The new `demo-smoke` CI job runs those same commands on an Ubuntu runner,
  includes failure diagnostics and always stops the demo. Its hosted execution
  remains pending until these commits are pushed through the repository workflow.
- Targeted packaging tests (5), root type checking, ESLint and repository-wide
  formatting passed after the isolation/smoke changes. Independent review found
  no remaining blockers.

Separate checkouts previously shared demo volumes. New settings now persist a
validated random Compose project name; legacy settings preserve the original
project and data. The rehearsal demo was stopped and its generated settings and
volumes retained. The temporary builder was removed. This local Git-clone test
does not verify cloning from GitHub, hosted CI or anonymous registry pulls.

## Browser verification — 2026-10-20

Production builds of both services were checked in an isolated Linux Playwright
1.63.0 container, using synthetic PostgreSQL, SMTP and storage fixtures. The
candidate was `7f02fb8` plus the browser fixes in this working tree.

- Final full Chromium run: **124 passed, 1 skipped** in 6.0 minutes. The skipped
  case requires the separate representative benchmark harness. Optional analytics
  ran with its synthetic endpoint intercepted by Playwright.
- Responsive audit: **118 screens**, covering 46 backend and 19 storefront page
  sources plus their locale/state/role variants, at widths 1440, 768 and 375.
  No horizontal overflow or serious/critical axe violations were found. Mobile
  checkout and product-editor captures were also inspected visually.
- Corrected stale promotion selectors, separate customer-session setup, ambiguous
  diagnostic alert selection and SMS-save navigation timing. The email preview
  retains its sandbox and is audited separately under a script-blocking CSP,
  avoiding axe's reproduced stall in a script-disabled iframe.
- Added these regression suites to the default browser/CI selection.
- Visual inspection then found adjacent analytics consent buttons. Matching
  outlined buttons now have spacing and wrapping. A fresh production build passed
  the enhanced mobile analytics test (size/separation, consent, funnel and purchase
  retry); related unit tests, type checks and review also passed. The full run
  above preceded this focused visual fix; its affected flow was then retested.

Local reports/screenshots are retained under `.tmp-cuj/browser-final-report`,
`.tmp-cuj/browser-final-results` and `.tmp-cuj/browser-visual-report`. They are
ignored artifacts, not files shipped with the repository. The initial Windows
build was blocked by SWC native-cache permissions, so these passing results apply
to Linux Chromium. Firefox/WebKit, hosted CI, real provider acceptance and the
human merchant pilot remain outside this verification.

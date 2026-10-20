# Starter contributions

These are bounded contribution proposals, not claims of existing bugs or assigned
work. Open an issue with the relevant template and agree scope before starting.
Use synthetic fixtures and include the exact checks run in the PR.

## Verify the native Windows newcomer path

The recorded clean install uses Linux containers. Rehearse native PowerShell
installation, migrations and local launch from a fresh checkout, without changing
machine-wide permissions to bypass native-loader checks. Record versions,
elapsed time and actionable failures. Update the cookbook with verified commands
or a clear supported Docker alternative. No production data is involved.

Start with `docs/installation-storage-acceptance-2026-10-19.md`,
`docs/operator-cookbook.md` and `scripts/launcher-settings.mjs`.
Acceptance: a second Windows contributor can reproduce the documented result.

## Add a focused product-gallery keyboard journey

Review existing gallery coverage first. If not already covered, add a browser
journey that uploads multiple synthetic images, selects thumbnails with the
keyboard and verifies the selected image's accessible description. Include a
variant-specific image. Reuse the existing browser fixtures; do not introduce
a second test harness or contact external storage/providers.

Start with `apps/storefront/app/product-purchase.tsx` and
`tests/browser/catalog-polish.spec.ts`. Acceptance: a focused production browser
run demonstrates navigation and correct image/description selection.

## Observe a newcomer using the demo

Have a person unfamiliar with the repository follow `docs/contributor-start.md`
on a disposable machine. Record confusing instructions and missing prerequisites
without collecting credentials. Propose a small documentation fix supported by
their observations. An agent simulation does not satisfy this task or the separate
merchant pilot.

Acceptance: record OS/tool versions, steps, elapsed time and remaining blockers;
another person can follow the corrected instructions without help.

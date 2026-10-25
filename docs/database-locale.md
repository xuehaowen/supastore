# Database encoding and locale

New Supastore databases require PostgreSQL 18 and use:

- Encoding: `UTF8` for multilingual text and emoji.
- Locale provider: `builtin`.
- Builtin locale: `PG_UNICODE_FAST` for Unicode case conversion and character
  classification, with deterministic code point ordering.

This is configured in `db:init`, the Compose production/demo/smoke services,
and fresh integration/browser test databases. The integration runner uses a
fresh owned cluster under `.tmp-cuj/` for each run so old queued jobs and data
cannot affect later tests. Existing embedded development clusters and databases
are preserved.

Code point ordering is not language-specific alphabetical ordering. Merchant
navigation order continues to use the explicit storefront positions. Use an
explicit language-specific collation if a feature requires linguistic sorting.

## Existing databases

Run `pnpm db:check` to report the server version, encoding, provider and effective
locale (including libc `LC_COLLATE`/`LC_CTYPE`). Setup and application migrations
run the same check. PostgreSQL older than 18 and non-UTF8 databases stop setup;
an existing UTF8 `C` database produces a locale notice and remains supported.
The public readiness endpoint continues to check connectivity without publishing
database configuration.

`POSTGRES_INITDB_ARGS` applies only when initializing a new empty PostgreSQL
volume. Restarting Compose or running application migrations does not change an
existing database's locale. `db:init` also preserves existing databases.

Inspect a PostgreSQL 18 database with:

```sql
SELECT current_database(), pg_encoding_to_char(encoding) AS encoding,
       datlocprovider, datlocale, datcollate, datctype
FROM pg_database
WHERE datname = current_database();
```

`UTF8` with `C` already stores Unicode; changing the locale changes text
comparison and case behavior. PostgreSQL cannot change a database's default
locale in place. To migrate an existing instance, take a verified backup, create
a separate empty database with the settings below, restore using `pg_restore`
without `--create`, and validate row counts, constraints, search, sorting and
application flows before switching connection URLs. Pause writes during the
final dump/restore and cutover. Keep the original database for rollback.

```sql
CREATE DATABASE supastore_unicode
  WITH TEMPLATE template0
  ENCODING 'UTF8'
  LOCALE_PROVIDER builtin
  BUILTIN_LOCALE 'PG_UNICODE_FAST';
```

Restore into the new database so indexes are rebuilt with its locale. Do not
delete an existing volume or modify PostgreSQL system catalogs to change locale.

## Automated locale migration

Use migration administrator credentials in `MIGRATION_DATABASE_URL` (or
`DATABASE_URL`). The tool migrates to a new database on the same PostgreSQL
cluster, where the existing roles are already available. It never rewrites `.env`,
switches application URLs, overwrites a target, or deletes the source.

```sh
pnpm db:locale --target supastore_unicode
```

The default is a read-only plan. For execution, stop application writers,
schedulers and workers first, and keep them stopped through application validation
and cutover. Acknowledging this with `--writes-paused` does not stop them for you.
Use PostgreSQL 18 `pg_dump`/`pg_restore` on PATH, or provide `--pg-bin PATH`.
For the supplied local PostgreSQL container, use its actual container name:

```sh
pnpm db:locale --target supastore_unicode --apply --writes-paused --container postgres
```

The container option verifies the cluster identity before dumping and requires
permission to call `pg_control_system()`. It connects inside the container on
127.0.0.1:5432. Native tools use the original connection endpoint and TLS options.
Passwords are passed through the child environment, never process arguments.

The command writes a custom-format backup under ignored `.database-backups/`
(override with `--backup-dir PATH`), verifies the archive, creates the Unicode
database, and restores it in one transaction. Validation compares row counts,
order-independent row checksums, sequence state, database ownership, grants and
database/role settings. It also checks target locale and index validity and
refreshes planner statistics. Generated columns are recomputed during restore;
their source values are excluded from the row checksums. Source changes detected
during validation stop the migration. It writes a JSON validation report beside
the backup only after success.

If any step fails, the source, backup and any target remain available for
investigation; no cutover occurs. Fix the cause and retry with a new target name.
Protect backups as customer data, including filesystem permissions on Windows.
Verify storefront search, checkout and admin flows on the target before changing
both application and migration connection URLs. Keep the original database for
rollback; after new writes reach the target, rollback requires reconciling them.

## Storefront search

Migration `0049_unicode_search` adds NFC normalization, fixed `unaccent` rules and
explicit Unicode case conversion for product title/description and translated
title search. Original display text is preserved. This makes `cafe` match `café`
and canonically equivalent Unicode input match on both legacy `C` and new
Unicode databases. Search remains scoped to published products and the selected
or default translation locale. Existing typo tolerance remains enabled.

For a large online catalog, prebuild the expression indexes by running
`scripts/unicode-search-indexes.sql` with autocommit enabled before applying
migration 0049. Its concurrent builds avoid holding a write lock throughout index
construction. If a build fails, inspect `pg_index`, drop only the failed invalid
index concurrently and retry. The migration adopts prebuilt valid indexes;
fresh/offline installs create them transactionally. Do not change the search
function or unaccent rules without rebuilding all dependent expression indexes.

-- Run on the target database as migration owner, with autocommit enabled.
-- Do not wrap this file in a transaction (including psql --single-transaction).
-- Execute once before migration 0037 during an online upgrade.
-- A failed concurrent build can leave an INVALID index: inspect pg_index,
-- then drop only that invalid index CONCURRENTLY and retry its statement.
-- Do not use IF NOT EXISTS here: an existing invalid/conflicting index
-- must be investigated rather than silently accepted.
SET lock_timeout = '5s';
CREATE INDEX CONCURRENTLY "idx_order_admin_history" ON "orders" ("created_at", "id");
CREATE INDEX CONCURRENTLY "idx_order_status_history" ON "orders" ("lifecycle_status", "created_at", "id");
RESET lock_timeout;

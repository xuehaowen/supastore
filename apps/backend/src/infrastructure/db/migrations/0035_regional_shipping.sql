-- Existing country zones retain their rates; empty arrays impose no restriction.
ALTER TABLE shipping_zones ADD COLUMN region_codes jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE shipping_zones ADD COLUMN postal_prefixes jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Rollback: first roll back application code, then drop postal_prefixes and
-- region_codes in a new forward migration. Regional configuration would be lost.

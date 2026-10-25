ALTER TABLE promotions ADD COLUMN maximum_original_subtotal_cents integer;
--> statement-breakpoint
ALTER TABLE promotions ADD COLUMN maximum_quantity integer;
--> statement-breakpoint
ALTER TABLE promotions ADD CONSTRAINT promotions_maximum_original_subtotal_positive CHECK (maximum_original_subtotal_cents IS NULL OR maximum_original_subtotal_cents > 0);
--> statement-breakpoint
ALTER TABLE promotions ADD CONSTRAINT promotions_maximum_quantity_valid CHECK (maximum_quantity IS NULL OR maximum_quantity BETWEEN 1 AND 99900);

ALTER TABLE store_settings ADD COLUMN commerce_rules jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE store_settings ADD CONSTRAINT commerce_rules_array CHECK (jsonb_typeof(commerce_rules) = 'array' AND jsonb_array_length(commerce_rules) <= 100);

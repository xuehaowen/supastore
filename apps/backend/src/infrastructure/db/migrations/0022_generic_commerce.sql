ALTER TABLE store_settings ADD COLUMN commerce_policy jsonb NOT NULL DEFAULT '{"guestCheckout":true,"rewardsEnabled":false,"rewardRateBasisPoints":500,"shippingEnabled":true,"pickupEnabled":true,"salesThresholdCents":null}';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN taxable boolean NOT NULL DEFAULT true, ADD COLUMN reward_eligible boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN reward_snapshot jsonb;
--> statement-breakpoint
ALTER TABLE customers ADD COLUMN phone text;
--> statement-breakpoint
ALTER TABLE pickup_location ADD COLUMN slot_capacity integer CHECK (slot_capacity >= 0), ADD COLUMN schedule_required boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE slot_variant_quotas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slot_id uuid NOT NULL REFERENCES pickup_time_slots(id), variant_id uuid NOT NULL REFERENCES product_variants(id), quantity integer NOT NULL CHECK(quantity >= 0), CONSTRAINT uq_slot_variant_quota UNIQUE(slot_id,variant_id));
--> statement-breakpoint
CREATE TABLE slot_reservations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slot_id uuid NOT NULL REFERENCES pickup_time_slots(id), order_id uuid NOT NULL UNIQUE REFERENCES orders(id), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','consumed','released')), created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX slot_reservation_capacity ON slot_reservations(slot_id,status);

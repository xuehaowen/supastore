ALTER TABLE refund_authorizations ADD COLUMN component_refunds jsonb;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN reward_funding_review boolean NOT NULL DEFAULT false;

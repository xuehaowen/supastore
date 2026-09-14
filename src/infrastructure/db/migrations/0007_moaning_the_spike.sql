CREATE TABLE "promotion_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"discount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_redemptions_discount_positive" CHECK ("promotion_redemptions"."discount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"discount_type" text NOT NULL,
	"discount_value" integer NOT NULL,
	"minimum_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"usage_limit" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_code_unique" UNIQUE("code"),
	CONSTRAINT "promotions_value_positive" CHECK ("promotions"."discount_value" > 0),
	CONSTRAINT "promotions_minimum_nonnegative" CHECK ("promotions"."minimum_subtotal_cents" >= 0),
	CONSTRAINT "promotions_percentage_max" CHECK ("promotions"."discount_type" <> 'percentage' OR "promotions"."discount_value" <= 10000),
	CONSTRAINT "promotions_usage_limit_positive" CHECK ("promotions"."usage_limit" IS NULL OR "promotions"."usage_limit" > 0)
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_redemptions_order_unique" ON "promotion_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "promotion_redemptions_promotion_idx" ON "promotion_redemptions" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "promotions_active_window_idx" ON "promotions" USING btree ("is_active","starts_at","ends_at");
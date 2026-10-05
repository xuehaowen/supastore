CREATE TABLE "order_return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"restocked_quantity" integer DEFAULT 0 NOT NULL,
	"damaged_quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "return_quantity_valid" CHECK ("order_return_items"."quantity" > 0 and "order_return_items"."restocked_quantity" >= 0 and "order_return_items"."damaged_quantity" >= 0 and "order_return_items"."restocked_quantity" + "order_return_items"."damaged_quantity" <= "order_return_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "order_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"request_key" text NOT NULL,
	"review_reason" text,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_returns_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_return_id_order_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_return_order_item" ON "order_return_items" USING btree ("return_id","order_item_id");--> statement-breakpoint
CREATE INDEX "idx_order_return_owner" ON "order_returns" USING btree ("order_id","created_at");
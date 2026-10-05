CREATE TABLE "product_option_values" (
	"option_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"attribute_value_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "combination_key" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sku_prefix" text;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attributes" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_option_owner" ON "product_options" USING btree ("id","attribute_id");--> statement-breakpoint
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_option_id_attribute_id_product_options_id_attribute_id_fk" FOREIGN KEY ("option_id","attribute_id") REFERENCES "public"."product_options"("id","attribute_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_attribute_id_attribute_value_id_attribute_values_attribute_id_id_fk" FOREIGN KEY ("attribute_id","attribute_value_id") REFERENCES "public"."attribute_values"("attribute_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_option_value" ON "product_option_values" USING btree ("option_id","attribute_value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_option" ON "product_options" USING btree ("product_id","attribute_id");

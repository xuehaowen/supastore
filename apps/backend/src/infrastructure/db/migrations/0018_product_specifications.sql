CREATE TABLE "product_specifications" (
	"product_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"attribute_value_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_attribute_id_attribute_value_id_attribute_values_attribute_id_id_fk" FOREIGN KEY ("attribute_id","attribute_value_id") REFERENCES "public"."attribute_values"("attribute_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_specification" ON "product_specifications" USING btree ("product_id","attribute_id","attribute_value_id");
CREATE TABLE "product_collection_memberships" (
	"collection_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_collections_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "product_collection_memberships" ADD CONSTRAINT "product_collection_memberships_collection_id_product_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."product_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_collection_memberships" ADD CONSTRAINT "product_collection_memberships_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_translations" ADD CONSTRAINT "collection_translations_collection_id_product_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."product_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_collection_product" ON "product_collection_memberships" USING btree ("collection_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_collection_product" ON "product_collection_memberships" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_collection_locale" ON "collection_translations" USING btree ("collection_id","locale");
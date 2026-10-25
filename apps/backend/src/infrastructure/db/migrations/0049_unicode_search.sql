-- Forward migration. Search normalization uses fixed unaccent rules; rebuild
-- these expression indexes if the dictionary or function changes in the future.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.storefront_search_text(value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, normalize(value, NFC)) COLLATE pg_catalog.pg_unicode_fast) $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_products_unicode_title ON public.products
USING gin (public.storefront_search_text(title) public.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_translations_unicode_title ON public.product_translations
USING gin (public.storefront_search_text(title) public.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_products_unicode_search ON public.products
USING gin (to_tsvector('simple', public.storefront_search_text(coalesce(title, '') || ' ' || coalesce(description, ''))));
